const express = require("express");
const router = express.Router();
const pool = require("../model/db");
const ErrorHandler = require("../utils/errorHandler");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const { isAuthenticatedAdmin } = require("../middlewares/auth");
const { uploadMixed } = require("../middlewares/upload");
const { deleteFromCloudinary, extractPublicId } = require("../utils/cloudinaryHelpers");

// POST: Add multiple backend projects
router.post(
    "/backend/add-data",
    isAuthenticatedAdmin,
    uploadMixed.array('images', 10),
    catchAsyncErrors(async (req, res, next) => {
        const { projects } = req.body;
        let parsedProjects;

        // Parse projects if it's a string
        try {
            parsedProjects = typeof projects === 'string' ? JSON.parse(projects) : projects;
        } catch (error) {
            return next(new ErrorHandler("Invalid projects format", 400));
        }

        // Check if projects is provided and is an array
        if (!parsedProjects || !Array.isArray(parsedProjects) || parsedProjects.length === 0) {
            return next(new ErrorHandler("Projects array is required and must contain at least one project", 400));
        }

        // Validate each project in the array
        for (let i = 0; i < parsedProjects.length; i++) {
            const { project_name, stack, description } = parsedProjects[i];
            
            if (!project_name || !stack || !description) {
                return next(new ErrorHandler(`Project ${i + 1}: project_name, stack, and description are required`, 400));
            }

            // Ensure stack is an array
            let stackArray;
            try {
                stackArray = typeof stack === 'string' ? JSON.parse(stack) : stack;
                if (!Array.isArray(stackArray)) {
                    stackArray = [stackArray];
                }
            } catch (error) {
                stackArray = Array.isArray(stack) ? stack : [stack];
            }

            if (stackArray.length === 0) {
                return next(new ErrorHandler(`Project ${i + 1}: At least one stack is required`, 400));
            }

            // Update the stack in the original object
            parsedProjects[i].stack = stackArray;
        }

        // Prepare batch insert with image handling
        const insertedProjects = [];
        const uploadedFiles = req.files || [];
        
        // Use transaction to ensure all projects are inserted or none
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            for (let i = 0; i < parsedProjects.length; i++) {
                const project = parsedProjects[i];
                const { project_name, stack, description, code, company, github_link, project_link } = project;
                
                // Get corresponding image if uploaded
                const imageUrl = uploadedFiles[i] ? uploadedFiles[i].path : null;

                const insertQuery = `
                    INSERT INTO backend_projects (project_name, stack, description, code, image, company, github_link, project_link, created_by_email)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING *
                `;

                const result = await client.query(insertQuery, [
                    project_name,
                    stack,
                    description,
                    code || null,
                    imageUrl,
                    company || null,
                    github_link || null,
                    project_link || null,
                    req.user.email
                ]);

                insertedProjects.push(result.rows[0]);
            }

            await client.query('COMMIT');

            res.status(201).json({
                success: true,
                message: `${insertedProjects.length} backend project(s) added successfully`,
                projects: insertedProjects,
                count: insertedProjects.length
            });

        } catch (error) {
            await client.query('ROLLBACK');
            
            // Clean up uploaded files if database operation failed
            if (uploadedFiles.length > 0) {
                for (const file of uploadedFiles) {
                    try {
                        const publicId = extractPublicId(file.path);
                        if (publicId) {
                            await deleteFromCloudinary(publicId, 'image');
                        }
                    } catch (cleanupError) {
                        console.error('Error cleaning up uploaded file:', cleanupError);
                    }
                }
            }
            
            throw error;
        } finally {
            client.release();
        }
    })
);

// POST: Add single backend project
router.post(
    "/backend/add-single",
    isAuthenticatedAdmin,
    uploadMixed.single('image'),
    catchAsyncErrors(async (req, res, next) => {
        const { project_name, stack, description, code, company, github_link, project_link } = req.body;

        if (!project_name || !stack || !description) {
            // Clean up uploaded file if validation fails
            if (req.file) {
                try {
                    const publicId = extractPublicId(req.file.path);
                    if (publicId) {
                        await deleteFromCloudinary(publicId, 'image');
                    }
                } catch (cleanupError) {
                    console.error('Error cleaning up uploaded file:', cleanupError);
                }
            }
            return next(new ErrorHandler("Project name, stack, and description are required", 400));
        }

        // Parse stack if it's a string
        let stackArray;
        try {
            stackArray = typeof stack === 'string' ? JSON.parse(stack) : stack;
            if (!Array.isArray(stackArray)) {
                stackArray = [stackArray];
            }
        } catch (error) {
            stackArray = Array.isArray(stack) ? stack : [stack];
        }

        if (stackArray.length === 0) {
            // Clean up uploaded file if validation fails
            if (req.file) {
                try {
                    const publicId = extractPublicId(req.file.path);
                    if (publicId) {
                        await deleteFromCloudinary(publicId, 'image');
                    }
                } catch (cleanupError) {
                    console.error('Error cleaning up uploaded file:', cleanupError);
                }
            }
            return next(new ErrorHandler("At least one stack is required", 400));
        }

        const imageUrl = req.file ? req.file.path : null;

        try {
            const insertQuery = `
                INSERT INTO backend_projects (project_name, stack, description, code, image, company, github_link, project_link, created_by_email)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `;

            const result = await pool.query(insertQuery, [
                project_name,
                stackArray,
                description,
                code || null,
                imageUrl,
                company || null,
                github_link || null,
                project_link || null,
                req.user.email
            ]);

            res.status(201).json({
                success: true,
                message: "Backend project added successfully",
                project: result.rows[0]
            });

        } catch (error) {
            // Clean up uploaded file if database operation fails
            if (req.file) {
                try {
                    const publicId = extractPublicId(req.file.path);
                    if (publicId) {
                        await deleteFromCloudinary(publicId, 'image');
                    }
                } catch (cleanupError) {
                    console.error('Error cleaning up uploaded file:', cleanupError);
                }
            }
            throw error;
        }
    })
);

// GET: Fetch all backend projects
router.get(
    "/backend/get-data",
    catchAsyncErrors(async (req, res, next) => {
        const selectQuery = `
            SELECT bp.*, u.email as creator_email 
            FROM backend_projects bp
            LEFT JOIN users u ON bp.created_by_email = u.email
            ORDER BY bp.created_at DESC
        `;
        
        const result = await pool.query(selectQuery);

        res.status(200).json({
            success: true,
            message: "Backend projects fetched successfully",
            projects: result.rows,
            count: result.rows.length
        });
    })
);

// GET: Fetch backend project by ID
router.get(
    "/backend/get-data/:id",
    catchAsyncErrors(async (req, res, next) => {
        const { id } = req.params;

        if (!id || isNaN(id)) {
            return next(new ErrorHandler("Valid project ID is required", 400));
        }

        const selectQuery = `
            SELECT bp.*, u.email as creator_email 
            FROM backend_projects bp
            LEFT JOIN users u ON bp.created_by_email = u.email
            WHERE bp.id = $1
        `;
        
        const result = await pool.query(selectQuery, [id]);

        if (result.rows.length === 0) {
            return next(new ErrorHandler("Backend project not found", 404));
        }

        res.status(200).json({
            success: true,
            message: "Backend project fetched successfully",
            project: result.rows[0]
        });
    })
);

// PUT: Edit backend project
router.put(
    "/backend/edit-data/:id",
    isAuthenticatedAdmin,
    uploadMixed.single('image'),
    catchAsyncErrors(async (req, res, next) => {
        const { id } = req.params;
        const { project_name, stack, description, code, company, github_link, project_link, remove_image } = req.body;

        if (!id || isNaN(id)) {
            // Clean up uploaded file if validation fails
            if (req.file) {
                try {
                    const publicId = extractPublicId(req.file.path);
                    if (publicId) {
                        await deleteFromCloudinary(publicId, 'image');
                    }
                } catch (cleanupError) {
                    console.error('Error cleaning up uploaded file:', cleanupError);
                }
            }
            return next(new ErrorHandler("Valid project ID is required", 400));
        }

        // Check if project exists and user has permission
        const existingProject = await pool.query(
            'SELECT * FROM backend_projects WHERE id = $1',
            [id]
        );

        if (existingProject.rows.length === 0) {
            // Clean up uploaded file if project not found
            if (req.file) {
                try {
                    const publicId = extractPublicId(req.file.path);
                    if (publicId) {
                        await deleteFromCloudinary(publicId, 'image');
                    }
                } catch (cleanupError) {
                    console.error('Error cleaning up uploaded file:', cleanupError);
                }
            }
            return next(new ErrorHandler("Backend project not found", 404));
        }

        // Check if user is the creator or admin
        if (existingProject.rows[0].created_by_email !== req.user.email && req.user.role !== 'admin') {
            // Clean up uploaded file if unauthorized
            if (req.file) {
                try {
                    const publicId = extractPublicId(req.file.path);
                    if (publicId) {
                        await deleteFromCloudinary(publicId, 'image');
                    }
                } catch (cleanupError) {
                    console.error('Error cleaning up uploaded file:', cleanupError);
                }
            }
            return next(new ErrorHandler("You can only edit your own projects", 403));
        }

        // Prepare update fields
        const updateFields = [];
        const updateValues = [];
        let paramCount = 0;
        const oldImageUrl = existingProject.rows[0].image;
        let newImageUrl = oldImageUrl;

        // Handle image update/removal
        if (remove_image === 'true' || req.file) {
            // Delete old image from Cloudinary if it exists
            if (oldImageUrl) {
                try {
                    const publicId = extractPublicId(oldImageUrl);
                    if (publicId) {
                        await deleteFromCloudinary(publicId, 'image');
                    }
                } catch (cleanupError) {
                    console.error('Error deleting old image:', cleanupError);
                }
            }

            if (remove_image === 'true') {
                newImageUrl = null;
            } else if (req.file) {
                newImageUrl = req.file.path;
            }

            paramCount++;
            updateFields.push(`image = $${paramCount}`);
            updateValues.push(newImageUrl);
        }

        if (project_name !== undefined) {
            paramCount++;
            updateFields.push(`project_name = $${paramCount}`);
            updateValues.push(project_name);
        }

        if (stack !== undefined) {
            let stackArray;
            try {
                stackArray = typeof stack === 'string' ? JSON.parse(stack) : stack;
                if (!Array.isArray(stackArray)) {
                    stackArray = [stackArray];
                }
            } catch (error) {
                stackArray = Array.isArray(stack) ? stack : [stack];
            }

            if (stackArray.length === 0) {
                // Clean up uploaded file if validation fails
                if (req.file) {
                    try {
                        const publicId = extractPublicId(req.file.path);
                        if (publicId) {
                            await deleteFromCloudinary(publicId, 'image');
                        }
                    } catch (cleanupError) {
                        console.error('Error cleaning up uploaded file:', cleanupError);
                    }
                }
                return next(new ErrorHandler("At least one stack is required", 400));
            }
            
            paramCount++;
            updateFields.push(`stack = $${paramCount}`);
            updateValues.push(stackArray);
        }

        if (description !== undefined) {
            paramCount++;
            updateFields.push(`description = $${paramCount}`);
            updateValues.push(description);
        }

        if (code !== undefined) {
            paramCount++;
            updateFields.push(`code = $${paramCount}`);
            updateValues.push(code || null);
        }

        if (company !== undefined) {
            paramCount++;
            updateFields.push(`company = $${paramCount}`);
            updateValues.push(company || null);
        }

        if (github_link !== undefined) {
            paramCount++;
            updateFields.push(`github_link = $${paramCount}`);
            updateValues.push(github_link || null);
        }

        if (project_link !== undefined) {
            paramCount++;
            updateFields.push(`project_link = $${paramCount}`);
            updateValues.push(project_link || null);
        }

        if (updateFields.length === 0) {
            // Clean up uploaded file if no fields to update
            if (req.file) {
                try {
                    const publicId = extractPublicId(req.file.path);
                    if (publicId) {
                        await deleteFromCloudinary(publicId, 'image');
                    }
                } catch (cleanupError) {
                    console.error('Error cleaning up uploaded file:', cleanupError);
                }
            }
            return next(new ErrorHandler("No fields to update", 400));
        }

        // Add updated_at
        paramCount++;
        updateFields.push(`updated_at = $${paramCount}`);
        updateValues.push(new Date());

        // Add id for WHERE clause
        paramCount++;
        updateValues.push(parseInt(id));

        try {
            const updateQuery = `
                UPDATE backend_projects 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await pool.query(updateQuery, updateValues);

            res.status(200).json({
                success: true,
                message: "Backend project updated successfully",
                project: result.rows[0]
            });

        } catch (error) {
            // If update failed and we uploaded a new file, clean it up
            if (req.file) {
                try {
                    const publicId = extractPublicId(req.file.path);
                    if (publicId) {
                        await deleteFromCloudinary(publicId, 'image');
                    }
                } catch (cleanupError) {
                    console.error('Error cleaning up uploaded file:', cleanupError);
                }
            }
            throw error;
        }
    })
);

// DELETE: Remove backend project
router.delete(
    "/backend/remove-data/:id",
    isAuthenticatedAdmin,
    catchAsyncErrors(async (req, res, next) => {
        const { id } = req.params;

        if (!id || isNaN(id)) {
            return next(new ErrorHandler("Valid project ID is required", 400));
        }

        // Check if project exists and user has permission
        const existingProject = await pool.query(
            'SELECT * FROM backend_projects WHERE id = $1',
            [id]
        );

        if (existingProject.rows.length === 0) {
            return next(new ErrorHandler("Backend project not found", 404));
        }

        // Check if user is the creator or admin
        if (existingProject.rows[0].created_by_email !== req.user.email && req.user.role !== 'admin') {
            return next(new ErrorHandler("You can only delete your own projects", 403));
        }

        // Delete associated image from Cloudinary if it exists
        const imageUrl = existingProject.rows[0].image;
        if (imageUrl) {
            try {
                const publicId = extractPublicId(imageUrl);
                if (publicId) {
                    await deleteFromCloudinary(publicId, 'image');
                }
            } catch (error) {
                console.error('Error deleting image from Cloudinary:', error);
                // Continue with project deletion even if image deletion fails
            }
        }

        const deleteQuery = 'DELETE FROM backend_projects WHERE id = $1 RETURNING *';
        const result = await pool.query(deleteQuery, [id]);

        res.status(200).json({
            success: true,
            message: "Backend project deleted successfully",
            project: result.rows[0]
        });
    })
);

module.exports = router;