const express = require("express");
const router = express.Router();
const pool = require("../model/db");
const ErrorHandler = require("../utils/errorHandler");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const { isAuthenticatedAdmin } = require("../middlewares/auth");
const { uploadMixed } = require("../middlewares/upload");
const { deleteFromCloudinary, generateVideoThumbnail } = require("../utils/cloudinaryHelpers");

// POST: Add mobile app with file uploads
router.post(
    "/mobile/add-mobileApp",
    isAuthenticatedAdmin,
    uploadMixed.array('media', 20),
    catchAsyncErrors(async (req, res, next) => {
        const { 
            project_name, 
            industry, 
            stacks, 
            designer, 
            designerLink,
            company,
            status, 
            project_link, 
            github_link,
            media_descriptions,
        } = req.body;

        // Validate required fields
        if (!project_name || !industry || !stacks) {
            return next(new ErrorHandler("Project name, industry, and stacks are required", 400));
        }

        // Simple status handling - just use whatever is provided or default
        const projectStatus = status || 'in_progress';
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Process uploaded media files
            let mediaArray = [];
            
            if (req.files && req.files.length > 0) {
                console.log(`Processing ${req.files.length} files...`);
                
                const descriptions = media_descriptions ? 
                    (typeof media_descriptions === 'string' ? JSON.parse(media_descriptions) : media_descriptions) 
                    : {};
                
                for (let i = 0; i < req.files.length; i++) {
                    const file = req.files[i];
                    const description = descriptions[i] || `${file.mimetype.startsWith('image/') ? 'Image' : 'Video'} ${i + 1}`;
                    
                    console.log(`File ${i + 1} uploaded:`, {
                        originalname: file.originalname,
                        path: file.path,
                        filename: file.filename
                    });
                    
                    let thumbnailUrl = null;
                    if (file.mimetype.startsWith('video/')) {
                        try {
                            thumbnailUrl = generateVideoThumbnail(file.filename);
                        } catch (thumbnailError) {
                            console.warn('Thumbnail generation failed:', thumbnailError.message);
                        }
                    }

                    const mediaItem = {
                        id: Date.now() + i,
                        file_url: file.path,
                        file_type: file.mimetype,
                        file_size: file.size,
                        public_id: file.filename,
                        description: description,
                        thumbnail_url: thumbnailUrl,
                        display_order: i + 1,
                        uploaded_at: new Date().toISOString(),
                        original_name: file.originalname
                    };

                    mediaArray.push(mediaItem);
                }
            }

            // Parse stacks - handle both string and array formats
            let stacksArray;
            if (typeof stacks === 'string') {
                stacksArray = stacks.split(',').map(s => s.trim()).filter(s => s.length > 0);
            } else if (Array.isArray(stacks)) {
                stacksArray = stacks;
            } else {
                stacksArray = [stacks];
            }

            // Insert mobile app data
            const insertQuery = `
                INSERT INTO mobile_apps (
                    project_name, industry, stacks, designer, designer_link, company, status, 
                    media, project_link, github_link, created_by_email, 
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()) 
                RETURNING *
            `;
            
            const result = await client.query(insertQuery, [
                project_name,
                industry,
                stacksArray,
                designer || null,
                designerLink || null,
                company || null,
                projectStatus,
                JSON.stringify(mediaArray),
                project_link || null,
                github_link || null,
                req.user.email
            ]);

            await client.query('COMMIT');

            res.status(201).json({
                success: true,
                message: `Mobile app created successfully with ${mediaArray.length} media files`,
                data: result.rows[0]
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Database error:', error);
            
            // Clean up uploaded files if database insertion fails
            if (req.files) {
                for (const file of req.files) {
                    console.log(`Cleaning up file: ${file.filename}`);
                    console.log(`File type: ${file.mimetype}`);
                    console.log(`File path: ${file.path}`);
                    console.log(`File size: ${file.size} bytes`);
                    console.log(`Original name: ${file.originalname}`);
                    try {
                        await deleteFromCloudinary(file.filename, file.mimetype.startsWith('video/') ? 'video' : 'image');
                    } catch (cleanupError) {
                        console.error('Error cleaning up file:', cleanupError);
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
    uploadMixed.array('new_media', 20),
    catchAsyncErrors(async (req, res, next) => {
        const { id } = req.params;
        const { 
            project_name, 
            industry, 
            stacks, 
            designer, 
            designerLink,
            company,
            status, 
            project_link, 
            github_link,
            media_descriptions,
            remove_media_ids,
            update_media_descriptions
        } = req.body;

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Check if mobile app exists
            const existingApp = await client.query('SELECT * FROM mobile_apps WHERE id = $1', [id]);
            if (existingApp.rows.length === 0) {
                return next(new ErrorHandler("Mobile app not found", 404));
            }

            const currentApp = existingApp.rows[0];
            let currentMedia = currentApp.media || [];

            // Remove specified media files
            if (remove_media_ids) {
                const mediaIdsToRemove = JSON.parse(remove_media_ids);
                const mediaToDelete = currentMedia.filter(media => mediaIdsToRemove.includes(media.id));
                
                // Delete from Cloudinary
                for (const media of mediaToDelete) {
                    try {
                        await deleteFromCloudinary(
                            media.public_id, 
                            media.file_type.startsWith('video/') ? 'video' : 'image'
                        );
                    } catch (cloudinaryError) {
                        console.error('Error deleting from Cloudinary:', cloudinaryError);
                    }
                }
                
                currentMedia = currentMedia.filter(media => !mediaIdsToRemove.includes(media.id));
            }

            // Update existing media descriptions
            if (update_media_descriptions) {
                const descriptions = JSON.parse(update_media_descriptions);
                currentMedia = currentMedia.map(media => {
                    if (descriptions[media.id]) {
                        return { ...media, description: descriptions[media.id] };
                    }
                    return media;
                });
            }

            // Add new media files
            if (req.files && req.files.length > 0) {
                const maxOrder = currentMedia.length > 0 ? Math.max(...currentMedia.map(m => m.display_order || 0)) : 0;
                const descriptions = media_descriptions ? JSON.parse(media_descriptions) : {};
                
                for (let i = 0; i < req.files.length; i++) {
                    const file = req.files[i];
                    const description = descriptions[i] || `${file.mimetype.startsWith('image/') ? 'Image' : 'Video'} ${maxOrder + i + 1}`;
                    
                    let thumbnailUrl = null;
                    if (file.mimetype.startsWith('video/')) {
                        thumbnailUrl = generateVideoThumbnail(file.filename);
                    }

                    const mediaItem = {
                        id: Date.now() + i,
                        file_url: file.path,
                        file_type: file.mimetype,
                        file_size: file.size,
                        public_id: file.filename,
                        description: description,
                        thumbnail_url: thumbnailUrl,
                        display_order: maxOrder + i + 1,
                        uploaded_at: new Date().toISOString()
                    };

                    currentMedia.push(mediaItem);
                }
            }

            // Parse stacks if provided
            let stacksArray = currentApp.stacks;
            if (stacks) {
                if (typeof stacks === 'string') {
                    stacksArray = stacks.split(',').map(s => s.trim()).filter(s => s.length > 0);
                } else if (Array.isArray(stacks)) {
                    stacksArray = stacks;
                }
            }

            // Update mobile app
            const updateQuery = `
                UPDATE mobile_apps 
                SET project_name = $1, industry = $2, stacks = $3, designer = $4, 
                    designer_link = $5, company = $6, status = $7, media = $8, project_link = $9, 
                    github_link = $10, updated_at = NOW()
                WHERE id = $11
                RETURNING *
            `;
            
            const result = await client.query(updateQuery, [
                project_name || currentApp.project_name,
                industry || currentApp.industry,
                stacksArray,
                designer !== undefined ? designer : currentApp.designer,
                designerLink !== undefined ? designerLink : currentApp.designer_link,
                company !== undefined ? company : currentApp.company,
                status || currentApp.status,
                JSON.stringify(currentMedia),
                project_link !== undefined ? project_link : currentApp.project_link,
                github_link !== undefined ? github_link : currentApp.github_link,
                id
            ]);

            await client.query('COMMIT');

            res.status(200).json({
                success: true,
                message: "Mobile app updated successfully",
                data: result.rows[0]
            });

        } catch (error) {
            await client.query('ROLLBACK');
            
            if (req.files) {
                for (const file of req.files) {
                    try {
                        await deleteFromCloudinary(file.filename, file.mimetype.startsWith('video/') ? 'video' : 'image');
                    } catch (cleanupError) {
                        console.error('Error cleaning up file:', cleanupError);
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
                COUNT(DISTINCT designer) as unique_designers,
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

        const designerStatsQuery = `
            SELECT 
                designer,
                designer_link,
                COUNT(*) as projects_count,
                ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM mobile_apps WHERE designer IS NOT NULL)), 2) as percentage
            FROM mobile_apps
            WHERE designer IS NOT NULL
            GROUP BY designer, designer_link
            ORDER BY projects_count DESC
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
                designer,
                designer_link,
                jsonb_array_length(COALESCE(media, '[]'::jsonb)) as media_count
            FROM mobile_apps
            ORDER BY created_at DESC
            LIMIT 5
        `;

        const [statsResult, industryResult, companyResult, designerResult, stacksResult, recentResult] = await Promise.all([
            pool.query(statsQuery),
            pool.query(industryStatsQuery),
            pool.query(companyStatsQuery),
            pool.query(designerStatsQuery),
            pool.query(stacksStatsQuery),
            pool.query(recentAppsQuery)
        ]);

        res.status(200).json({
            success: true,
            data: {
                overview: statsResult.rows[0],
                industry_breakdown: industryResult.rows,
                company_breakdown: companyResult.rows,
                designer_breakdown: designerResult.rows,
                popular_stacks: stacksResult.rows,
                recent_apps: recentResult.rows
            }
        });
    })
);

module.exports = router;