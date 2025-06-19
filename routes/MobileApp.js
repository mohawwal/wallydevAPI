const express = require("express");
const router = express.Router();
const pool = require("../model/db");
const ErrorHandler = require("../utils/errorHandler");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const { isAuthenticatedAdmin } = require("../middlewares/auth");
const { uploadMixed } = require("../middlewares/upload");
const { deleteFromCloudinary, generateVideoThumbnail } = require("../utils/cloudinaryHelpers");
const path = require("path");
const fs = require("fs");
const compressVideo = require("../utils/videoCompressor");


// POST: Add mobile app with file uploads
router.post(
  "/mobile/add-mobileApp",
  isAuthenticatedAdmin,
  uploadMixed.array("media", 20),
  catchAsyncErrors(async (req, res, next) => {
    const {
      project_name,
      industry,
      stacks,
      designer,
      company,
      status,
      project_link,
      github_link,
      media_descriptions,
    } = req.body;

    if (!project_name || !industry || !stacks) {
      return next(new ErrorHandler("Project name, industry, and stacks are required", 400));
    }

    const projectStatus = status || "in_progress";
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      let mediaArray = [];
      const descriptions = media_descriptions
        ? typeof media_descriptions === "string"
          ? JSON.parse(media_descriptions)
          : media_descriptions
        : {};

      if (req.files && req.files.length > 0) {
        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          const isVideo = file.mimetype.startsWith("video/");
          const description = descriptions[i] || `${isVideo ? "Video" : "Image"} ${i + 1}`;

          let filePath = file.path;
          if (isVideo) {
            const compressedPath = path.join(
              path.dirname(filePath),
              `compressed-${file.filename}`
            );
            try {
              await compressVideo(filePath, compressedPath);
              fs.unlinkSync(filePath);
              filePath = compressedPath;
            } catch (err) {
              console.error("Video compression failed:", err);
            }
          }

          const cloudResult = await uploader.upload(filePath, {
            resource_type: isVideo ? "video" : "image",
            folder: "mobile_apps",
          });

          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

          mediaArray.push({
            id: Date.now() + i,
            file_url: cloudResult.secure_url,
            file_type: file.mimetype,
            file_size: cloudResult.bytes,
            public_id: cloudResult.public_id,
            description,
            thumbnail_url: isVideo ? generateVideoThumbnail(cloudResult.public_id) : null,
            display_order: i + 1,
            uploaded_at: new Date().toISOString(),
            original_name: file.originalname,
          });
        }
      }

      const stacksArray = typeof stacks === "string"
        ? stacks.split(",").map(s => s.trim()).filter(Boolean)
        : Array.isArray(stacks)
        ? stacks
        : [stacks];

      const insertQuery = `
        INSERT INTO mobile_apps (
          project_name, industry, stacks, designer, company, status, 
          media, project_link, github_link, created_by_email, 
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) 
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        project_name,
        industry,
        stacksArray,
        designer || null,
        company || null,
        projectStatus,
        JSON.stringify(mediaArray),
        project_link || null,
        github_link || null,
        req.user.email,
      ]);

      await client.query("COMMIT");
      res.status(201).json({ success: true, message: `Mobile app created successfully`, data: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      if (req.files) {
        for (const file of req.files) {
          try {
            await deleteFromCloudinary(file.filename, file.mimetype.startsWith("video/") ? "video" : "image");
          } catch (cleanupError) {
            console.error("Error cleaning up file:", cleanupError);
          }
        }
      }
      throw error;
    } finally {
      client.release();
    }
  })
);

// PUT: Update mobile app
router.put(
  "/mobile/update-mobileApp/:id",
  isAuthenticatedAdmin,
  uploadMixed.array("new_media", 20),
  catchAsyncErrors(async (req, res, next) => {
    const { id } = req.params;
    const {
      project_name,
      industry,
      stacks,
      designer,
      company,
      status,
      project_link,
      github_link,
      media_descriptions,
      remove_media_ids,
      update_media_descriptions,
    } = req.body;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existingApp = await client.query("SELECT * FROM mobile_apps WHERE id = $1", [id]);
      if (existingApp.rows.length === 0) return next(new ErrorHandler("Mobile app not found", 404));

      const currentApp = existingApp.rows[0];
      let currentMedia = currentApp.media || [];

      if (remove_media_ids) {
        const mediaIdsToRemove = JSON.parse(remove_media_ids);
        const mediaToDelete = currentMedia.filter(media => mediaIdsToRemove.includes(media.id));

        for (const media of mediaToDelete) {
          try {
            await deleteFromCloudinary(
              media.public_id,
              media.file_type.startsWith("video/") ? "video" : "image"
            );
          } catch (cloudinaryError) {
            console.error("Error deleting from Cloudinary:", cloudinaryError);
          }
        }

        currentMedia = currentMedia.filter(media => !mediaIdsToRemove.includes(media.id));
      }

      if (update_media_descriptions) {
        const descriptions = JSON.parse(update_media_descriptions);
        currentMedia = currentMedia.map(media => {
          if (descriptions[media.id]) media.description = descriptions[media.id];
          return media;
        });
      }

      if (req.files && req.files.length > 0) {
        const maxOrder = currentMedia.length > 0 ? Math.max(...currentMedia.map(m => m.display_order || 0)) : 0;
        const descriptions = media_descriptions ? JSON.parse(media_descriptions) : {};

        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          const isVideo = file.mimetype.startsWith("video/");
          const description = descriptions[i] || `${isVideo ? "Video" : "Image"} ${maxOrder + i + 1}`;

          let filePath = file.path;
          if (isVideo) {
            const compressedPath = path.join(path.dirname(filePath), `compressed-${file.filename}`);
            try {
              await compressVideo(filePath, compressedPath);
              fs.unlinkSync(filePath);
              filePath = compressedPath;
            } catch (err) {
              console.error("Video compression failed:", err);
            }
          }

          const cloudResult = await uploader.upload(filePath, {
            resource_type: isVideo ? "video" : "image",
            folder: "mobile_apps",
          });

          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

          currentMedia.push({
            id: Date.now() + i,
            file_url: cloudResult.secure_url,
            file_type: file.mimetype,
            file_size: cloudResult.bytes,
            public_id: cloudResult.public_id,
            description,
            thumbnail_url: isVideo ? generateVideoThumbnail(cloudResult.public_id) : null,
            display_order: maxOrder + i + 1,
            uploaded_at: new Date().toISOString(),
            original_name: file.originalname,
          });
        }
      }

      const stacksArray = stacks
        ? typeof stacks === "string"
          ? stacks.split(",").map(s => s.trim()).filter(Boolean)
          : stacks
        : currentApp.stacks;

      const updateQuery = `
        UPDATE mobile_apps 
        SET project_name = $1, industry = $2, stacks = $3, designer = $4, 
            company = $5, status = $6, media = $7, project_link = $8, github_link = $9, updated_at = NOW()
        WHERE id = $10 RETURNING *
      `;

      const result = await client.query(updateQuery, [
        project_name || currentApp.project_name,
        industry || currentApp.industry,
        stacksArray,
        designer !== undefined ? designer : currentApp.designer,
        company !== undefined ? company : currentApp.company,
        status || currentApp.status,
        JSON.stringify(currentMedia),
        project_link !== undefined ? project_link : currentApp.project_link,
        github_link !== undefined ? github_link : currentApp.github_link,
        id,
      ]);

      await client.query("COMMIT");
      res.status(200).json({ success: true, message: "Mobile app updated successfully", data: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      if (req.files) {
        for (const file of req.files) {
          try {
            await deleteFromCloudinary(file.filename, file.mimetype.startsWith("video/") ? "video" : "image");
          } catch (cleanupError) {
            console.error("Error cleaning up file:", cleanupError);
          }
        }
      }
      throw error;
    } finally {
      client.release();
    }
  })
);

// DELETE: Delete mobile app and all associated media
router.delete(
    "/mobile/delete-mobileApp/:id",
    isAuthenticatedAdmin,
    catchAsyncErrors(async (req, res, next) => {
        const { id } = req.params;

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            const existingApp = await client.query('SELECT * FROM mobile_apps WHERE id = $1', [id]);
            if (existingApp.rows.length === 0) {
                return next(new ErrorHandler("Mobile app not found", 404));
            }

            const mediaFiles = existingApp.rows[0].media || [];

            // Delete media files from Cloudinary
            for (const media of mediaFiles) {
                try {
                    await deleteFromCloudinary(
                        media.public_id, 
                        media.file_type.startsWith('video/') ? 'video' : 'image'
                    );
                } catch (cloudinaryError) {
                    console.error('Error deleting from Cloudinary:', cloudinaryError);
                }
            }

            await client.query('DELETE FROM mobile_apps WHERE id = $1', [id]);
            await client.query('COMMIT');

            res.status(200).json({
                success: true,
                message: "Mobile app and all associated media deleted successfully"
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    })
);

// GET: Get all mobile apps
router.get(
    "/mobile/get-all-mobileApps",
    catchAsyncErrors(async (req, res, next) => {
        try {
            const dataQuery = `
                SELECT 
                    *,
                    array_length(stacks, 1) as stacks_count,
                    jsonb_array_length(COALESCE(media, '[]'::jsonb)) as media_count,
                    CASE 
                        WHEN jsonb_array_length(COALESCE(media, '[]'::jsonb)) > 0 
                        THEN (media->0->>'file_url')::text 
                        ELSE NULL 
                    END as featured_image
                FROM mobile_apps
                ORDER BY created_at DESC
            `;

            const result = await pool.query(dataQuery);

            res.status(200).json({
                success: true,
                data: result.rows,
                total_count: result.rows.length
            });
        } catch (error) {
            console.error('Get all mobile apps error:', error);
            throw error;
        }
    })
);

// GET: Get mobile app by ID
router.get(
    "/mobile/get-mobileApp/:id",
    catchAsyncErrors(async (req, res, next) => {
        const { id } = req.params;

        const query = `
            SELECT 
                *,
                array_length(stacks, 1) as stacks_count,
                jsonb_array_length(COALESCE(media, '[]'::jsonb)) as media_count
            FROM mobile_apps 
            WHERE id = $1
        `;

        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return next(new ErrorHandler("Mobile app not found", 404));
        }

        res.status(200).json({
            success: true,
            data: result.rows[0]
        });
    })
);

// GET: Get mobile apps with company statistics
router.get(
    "/mobile/get-mobileApps-stats",
    isAuthenticatedAdmin,
    catchAsyncErrors(async (req, res, next) => {
        const statsQuery = `
            SELECT 
                COUNT(*) as total_apps,
                COUNT(CASE WHEN LOWER(status) LIKE '%completed%' THEN 1 END) as completed_apps,
                COUNT(CASE WHEN LOWER(status) LIKE '%progress%' THEN 1 END) as in_progress_apps,
                COUNT(CASE WHEN LOWER(status) LIKE '%hold%' THEN 1 END) as on_hold_apps,
                COUNT(CASE WHEN LOWER(status) LIKE '%cancelled%' THEN 1 END) as cancelled_apps,
                COUNT(DISTINCT industry) as unique_industries,
                COUNT(DISTINCT company) as unique_companies,
                AVG(jsonb_array_length(COALESCE(media, '[]'::jsonb))) as avg_media_per_app,
                SUM(jsonb_array_length(COALESCE(media, '[]'::jsonb))) as total_media_files
            FROM mobile_apps
        `;

        const industryStatsQuery = `
            SELECT 
                industry,
                COUNT(*) as count,
                ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM mobile_apps)), 2) as percentage
            FROM mobile_apps
            GROUP BY industry
            ORDER BY count DESC
        `;

        const companyStatsQuery = `
            SELECT 
                company,
                COUNT(*) as count,
                ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM mobile_apps WHERE company IS NOT NULL)), 2) as percentage
            FROM mobile_apps
            WHERE company IS NOT NULL
            GROUP BY company
            ORDER BY count DESC
            LIMIT 10
        `;

        const stacksStatsQuery = `
            SELECT 
                unnest(stacks) as stack,
                COUNT(*) as usage_count
            FROM mobile_apps
            GROUP BY unnest(stacks)
            ORDER BY usage_count DESC
            LIMIT 10
        `;

        const recentAppsQuery = `
            SELECT 
                project_name, 
                created_at, 
                status,
                industry,
                company,
                jsonb_array_length(COALESCE(media, '[]'::jsonb)) as media_count
            FROM mobile_apps
            ORDER BY created_at DESC
            LIMIT 5
        `;

        const [statsResult, industryResult, companyResult, stacksResult, recentResult] = await Promise.all([
            pool.query(statsQuery),
            pool.query(industryStatsQuery),
            pool.query(companyStatsQuery),
            pool.query(stacksStatsQuery),
            pool.query(recentAppsQuery)
        ]);

        res.status(200).json({
            success: true,
            data: {
                overview: statsResult.rows[0],
                industry_breakdown: industryResult.rows,
                company_breakdown: companyResult.rows,
                popular_stacks: stacksResult.rows,
                recent_apps: recentResult.rows
            }
        });
    })
);

module.exports = router;