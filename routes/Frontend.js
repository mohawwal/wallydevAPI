const express = require("express");
const router = express.Router();
const pool = require("../model/db");
const ErrorHandler = require("../utils/errorHandler");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const { isAuthenticatedAdmin } = require("../middlewares/auth")


router.post(
    "/frontend/add-data",
    isAuthenticatedAdmin,
    catchAsyncErrors(async (req, res, next) => {
        const { projects } = req.body;

        // Check if projects is provided and is an array
        if (!projects || !Array.isArray(projects) || projects.length === 0) {
            return next(new ErrorHandler("Projects array is required and must contain at least one project", 400));
        }

        // Validate each project in the array
        for (let i = 0; i < projects.length; i++) {
            const { project_name, role, stacks, category } = projects[i];
            
            if (!project_name || !role || !stacks || !category) {
                return next(new ErrorHandler(`Project ${i + 1}: project_name, role, stacks, and category are required`, 400));
            }

            // Ensure stacks is an array
            const stacksArray = Array.isArray(stacks) ? stacks : [stacks];
            if (stacksArray.length === 0) {
                return next(new ErrorHandler(`Project ${i + 1}: At least one stack is required`, 400));
            }

            // Update the stacks in the original object
            projects[i].stacks = stacksArray;
        }

        // Prepare batch insert
        const insertedProjects = [];
        
        // Use transaction to ensure all projects are inserted or none
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            for (const project of projects) {
                const { project_name, role, stacks, category, project_link, github_link } = project;

                const insertQuery = `
                    INSERT INTO frontend_projects (project_name, role, stacks, category, project_link, github_link, created_by_email)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *
                `;

                const result = await client.query(insertQuery, [
                    project_name,
                    role,
                    stacks,
                    category,
                    project_link || null,
                    github_link || null,
                    req.user.email
                ]);

                insertedProjects.push(result.rows[0]);
            }

            await client.query('COMMIT');

            res.status(201).json({
                success: true,
                message: `${insertedProjects.length} frontend project(s) added successfully`,
                projects: insertedProjects,
                count: insertedProjects.length
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    })
);


router.post(
    "/frontend/add-single",
    isAuthenticatedAdmin,
    catchAsyncErrors(async (req, res, next) => {
        const { project_name, role, stacks, category, project_link, github_link } = req.body;

        if (!project_name || !role || !stacks || !category) {
            return next(new ErrorHandler("Project name, role, stacks, and category are required", 400));
        }

        const stacksArray = Array.isArray(stacks) ? stacks : [stacks]
        if(stacksArray.length === 0) {
            return next(new ErrorHandler("At least one stack is required", 400))
        }

        const insertQuery = `
            INSERT INTO frontend_projects (project_name, role, stacks, category, project_link, github_link, created_by_email)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;

        const result = await pool.query(insertQuery, [
            project_name,
            role,
            stacksArray,
            category,
            project_link || null,
            github_link || null,
            req.user.email
        ]);

        res.status(201).json({
            success: true,
            message: "Frontend project added successfully",
            project: result.rows[0]
        });
    })
);


router.get(
    "/frontend/get-data",
    catchAsyncErrors(async (req, res, next) => {
        const selectQuery = `
            SELECT fp.*, u.email as creator_email 
            FROM frontend_projects fp
            LEFT JOIN users u ON fp.created_by_email = u.email
            ORDER BY fp.created_at DESC
        `;
        
        const result = await pool.query(selectQuery);

        res.status(200).json({
            success: true,
            message: "Frontend projects fetched successfully",
            projects: result.rows,
            count: result.rows.length
        });
    })
);


router.get(
    "/frontend/get-data/:id",
    catchAsyncErrors(async (req, res, next) => {
        const { id } = req.params;

        if (!id || isNaN(id)) {
            return next(new ErrorHandler("Valid project ID is required", 400));
        }

        const selectQuery = `
            SELECT fp.*, u.email as creator_email 
            FROM frontend_projects fp
            LEFT JOIN users u ON fp.created_by_email = u.email
            WHERE fp.id = $1
        `;
        
        const result = await pool.query(selectQuery, [parseInt(id)]);

        if (result.rows.length === 0) {
            return next(new ErrorHandler("Frontend project not found", 404));
        }

        res.status(200).json({
            success: true,
            message: "Frontend project fetched successfully",
            project: result.rows[0]
        });
    })
);


// PUT: Edit frontend project
router.put(
    "/frontend/edit-data/:id",
    isAuthenticatedAdmin,
    catchAsyncErrors(async (req, res, next) => {
        const { id } = req.params;
        const { project_name, role, stacks, category, project_link, github_link } = req.body;

        if (!id || isNaN(id)) {
            return next(new ErrorHandler("Valid project ID is required", 400));
        }

        // Check if project exists and user has permission
        const existingProject = await pool.query(
            'SELECT * FROM frontend_projects WHERE id = $1',
            [id]
        );

        if (existingProject.rows.length === 0) {
            return next(new ErrorHandler("Project not found", 404));
        }

        // Check if user is the creator or admin
        if (existingProject.rows[0].created_by_email !== req.user.email && req.user.role !== 'admin') {
            return next(new ErrorHandler("You can only edit your own projects", 403));
        }

        // Prepare update fields
        const updateFields = [];
        const updateValues = [];
        let paramCount = 0;

        if (project_name !== undefined) {
            paramCount++;
            updateFields.push(`project_name = $${paramCount}`);
            updateValues.push(project_name);
        }

        if (role !== undefined) {
            paramCount++;
            updateFields.push(`role = $${paramCount}`);
            updateValues.push(role);
        }

        if (stacks !== undefined) {
            const stacksArray = Array.isArray(stacks) ? stacks : [stacks];
            if (stacksArray.length === 0) {
                return next(new ErrorHandler("At least one stack is required", 400));
            }
            paramCount++;
            updateFields.push(`stacks = $${paramCount}`);
            updateValues.push(stacksArray);
        }

        if (category !== undefined) {
            paramCount++;
            updateFields.push(`category = $${paramCount}`);
            updateValues.push(category);
        }

        if (project_link !== undefined) {
            paramCount++;
            updateFields.push(`project_link = $${paramCount}`);
            updateValues.push(project_link || null);
        }

        if (github_link !== undefined) {
            paramCount++;
            updateFields.push(`github_link = $${paramCount}`);
            updateValues.push(github_link || null);
        }

        if (updateFields.length === 0) {
            return next(new ErrorHandler("No fields to update", 400));
        }

        // Add updated_at
        paramCount++;
        updateFields.push(`updated_at = $${paramCount}`);
        updateValues.push(new Date());

        // Add id for WHERE clause
        paramCount++;
        updateValues.push(parseInt(id));

        const updateQuery = `
            UPDATE frontend_projects 
            SET ${updateFields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await pool.query(updateQuery, updateValues);

        res.status(200).json({
            success: true,
            message: "Frontend project updated successfully",
            project: result.rows[0]
        });
    })
);


// DELETE: Remove frontend project
router.delete(
    "/frontend/remove-data/:id",
    isAuthenticatedAdmin,
    catchAsyncErrors(async (req, res, next) => {
        const { id } = req.params;

        if (!id || isNaN(id)) {
            return next(new ErrorHandler("Valid project ID is required", 400));
        }

        // Check if project exists and user has permission
        const existingProject = await pool.query(
            'SELECT * FROM frontend_projects WHERE id = $1',
            [id]
        );

        if (existingProject.rows.length === 0) {
            return next(new ErrorHandler("Project not found", 404));
        }

        // Check if user is the creator or admin
        if (existingProject.rows[0].created_by_email !== req.user.email && req.user.role !== 'admin') {
            return next(new ErrorHandler("You can only delete your own projects", 403));
        }

        const deleteQuery = 'DELETE FROM frontend_projects WHERE id = $1 RETURNING *';
        const result = await pool.query(deleteQuery, [id]);

        res.status(200).json({
            success: true,
            message: "Frontend project deleted successfully",
            project: result.rows[0]
        });
    })
);


module.exports = router;