// utils/videoCompressor.js
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);

const compressVideo = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-vcodec libx264",
        "-crf 28", // Compression level: 18 (high quality) – 28 (high compression)
        "-preset veryfast",
        "-acodec aac",
        "-b:a 128k"
      ])
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
};

module.exports = compressVideo;
