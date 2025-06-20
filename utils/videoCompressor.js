const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");

ffmpeg.setFfmpegPath(ffmpegPath);

// Get video metadata
const getVideoMetadata = (inputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        resolve({
          duration: metadata.format.duration,
          width: videoStream.width,
          height: videoStream.height,
          bitrate: metadata.format.bit_rate,
          size: metadata.format.size,
          fps: eval(videoStream.r_frame_rate) // Convert fraction to decimal
        });
      }
    });
  });
};

// Calculate optimal settings based on video metadata
const calculateOptimalSettings = (metadata, targetSizeMB = null) => {
  const { width, height, duration, bitrate, size } = metadata;
  
  // Determine if we need to resize
  let targetWidth = width;
  let targetHeight = height;
  
  // Only downscale if video is very large
  if (width > 1920 || height > 1080) {
    const aspectRatio = width / height;
    if (aspectRatio > 1) {
      // Landscape
      targetWidth = Math.min(1920, width);
      targetHeight = Math.round(targetWidth / aspectRatio);
    } else {
      // Portrait
      targetHeight = Math.min(1080, height);
      targetWidth = Math.round(targetHeight * aspectRatio);
    }
  }
  
  // Ensure dimensions are even (required for H.264)
  targetWidth = Math.floor(targetWidth / 2) * 2;
  targetHeight = Math.floor(targetHeight / 2) * 2;
  
  // Calculate target bitrate
  let targetBitrate;
  const currentBitrate = parseInt(bitrate);
  const pixelCount = targetWidth * targetHeight;
  
  // Base bitrate calculation on resolution
  if (pixelCount <= 640 * 480) {
    targetBitrate = 1000000; // 1 Mbps for SD
  } else if (pixelCount <= 1280 * 720) {
    targetBitrate = 2500000; // 2.5 Mbps for 720p
  } else if (pixelCount <= 1920 * 1080) {
    targetBitrate = 4000000; // 4 Mbps for 1080p
  } else {
    targetBitrate = 6000000; // 6 Mbps for higher resolutions
  }
  
  // Don't increase bitrate if original is lower
  if (currentBitrate && currentBitrate < targetBitrate) {
    targetBitrate = Math.max(currentBitrate * 0.8, 1000000);
  }
  
  // If target size is specified, calculate bitrate accordingly
  if (targetSizeMB && duration) {
    const targetSizeBytes = targetSizeMB * 1024 * 1024;
    const calculatedBitrate = (targetSizeBytes * 8) / duration * 0.9; // 90% for video, 10% for audio
    targetBitrate = Math.min(targetBitrate, calculatedBitrate);
  }
  
  return {
    width: targetWidth,
    height: targetHeight,
    bitrate: Math.floor(targetBitrate),
    crf: targetBitrate < 2000000 ? 26 : targetBitrate < 4000000 ? 23 : 20 // Higher quality for higher bitrates
  };
};

const compressVideo = async (inputPath, outputPath, options = {}) => {
  try {
    // Get video metadata first
    const metadata = await getVideoMetadata(inputPath);
    console.log('Original video metadata:', metadata);
    
    // Calculate optimal settings
    const settings = calculateOptimalSettings(metadata, options.targetSizeMB);
    console.log('Compression settings:', settings);
    
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath);
      
      // Video codec and quality settings
      command = command
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('128k')
        .audioChannels(2)
        .audioFrequency(44100);
      
      // Apply video settings
      if (settings.width !== metadata.width || settings.height !== metadata.height) {
        command = command.size(`${settings.width}x${settings.height}`);
      }
      
      // Use CRF for quality-based encoding (better than fixed bitrate)
      command = command.outputOptions([
        `-crf ${settings.crf}`, // Quality-based encoding
        '-preset medium', // Balance between speed and compression
        '-profile:v high', // H.264 profile for better compatibility
        '-level 4.0', // H.264 level
        '-pix_fmt yuv420p', // Pixel format for compatibility
        '-movflags +faststart', // Optimize for web streaming
        `-maxrate ${Math.floor(settings.bitrate * 1.5)}`, // Maximum bitrate
        `-bufsize ${Math.floor(settings.bitrate * 2)}`, // Buffer size
        '-g 50', // GOP size (keyframe interval)
        '-sc_threshold 0', // Disable scene change detection
        '-keyint_min 25', // Minimum keyframe interval
      ]);
      
      // Add frame rate optimization if original is very high
      if (metadata.fps > 30) {
        command = command.fps(30);
      }
      
      command
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`Compression progress: ${Math.round(progress.percent || 0)}%`);
        })
        .on('end', () => {
          console.log('Video compression completed');
          
          // Get compressed file stats
          fs.stat(outputPath, (err, stats) => {
            if (!err) {
              const originalSize = metadata.size || fs.statSync(inputPath).size;
              const compressedSize = stats.size;
              const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
              console.log(`Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
              console.log(`Compressed size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
              console.log(`Compression ratio: ${compressionRatio}%`);
            }
            resolve(outputPath);
          });
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .save(outputPath);
    });
  } catch (error) {
    console.error('Video compression error:', error);
    throw error;
  }
};

// Compress with different quality presets
const compressVideoWithPreset = async (inputPath, outputPath, preset = 'medium') => {
  const presets = {
    light: { targetSizeMB: null, crf: 20 }, // High quality, moderate compression
    medium: { targetSizeMB: null, crf: 23 }, // Balanced quality and size
    heavy: { targetSizeMB: null, crf: 26 } // Higher compression, good quality
  };
  
  const options = presets[preset] || presets.medium;
  return compressVideo(inputPath, outputPath, options);
};

module.exports = {
  compressVideo,
  compressVideoWithPreset,
  getVideoMetadata
};