const cloudinary = require('../config/cloudinary');

// Delete file from Cloudinary
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
};

// Get optimized URL
const getOptimizedUrl = (publicId, options = {}) => {
  return cloudinary.url(publicId, {
    fetch_format: 'auto',
    quality: 'auto',
    ...options
  });
};

// Generate thumbnail for video
const generateVideoThumbnail = (publicId) => {
  return cloudinary.url(publicId, {
    resource_type: 'video',
    start_offset: '5',
    duration: '1',
    format: 'jpg',
    transformation: [
      { width: 300, height: 200, crop: 'fill' }
    ]
  });
};

// Extract public ID from Cloudinary URL
const extractPublicId = (cloudinaryUrl) => {
  try {
    const parts = cloudinaryUrl.split('/');
    const fileWithExtension = parts[parts.length - 1];
    const fileName = fileWithExtension.split('.')[0];
    
    // Find the folder structure
    const uploadIndex = parts.findIndex(part => part === 'upload');
    if (uploadIndex !== -1 && uploadIndex < parts.length - 2) {
      const folderParts = parts.slice(uploadIndex + 2, -1);
      return folderParts.length > 0 ? `${folderParts.join('/')}/${fileName}` : fileName;
    }
    
    return fileName;
  } catch (error) {
    console.error('Error extracting public ID:', error);
    return null;
  }
};

module.exports = {
  deleteFromCloudinary,
  getOptimizedUrl,
  generateVideoThumbnail,
  extractPublicId
};
