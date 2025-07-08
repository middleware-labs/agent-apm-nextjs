'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Get Git repository information
 * @param {string} rootDir - Root directory to search for Git repository
 * @returns {Object} Git metadata
 */
function getGitMetadata(rootDir = process.cwd()) {
    const gitData = {};
    
    try {
        // Find .git directory
        const gitDir = findGitDirectory(rootDir);
        if (!gitDir) {
            return gitData;
        }
        
        // Change to git directory for commands
        const originalCwd = process.cwd();
        
        try {
            process.chdir(path.dirname(gitDir));
            
            // Get current branch
            try {
                const branch = execSync('git rev-parse --abbrev-ref HEAD', { 
                    encoding: 'utf8', 
                    timeout: 5000 
                }).trim();
                gitData['vcs.branch'] = branch;
            } catch (error) {
                console.warn('Failed to get git branch:', error.message);
            }
            
            // Get commit hash
            try {
                const commit = execSync('git rev-parse HEAD', { 
                    encoding: 'utf8', 
                    timeout: 5000 
                }).trim();
                gitData['vcs.commit.id'] = commit;
            } catch (error) {
                console.warn('Failed to get git commit:', error.message);
            }
            
            // Get short commit hash
            try {
                const shortCommit = execSync('git rev-parse --short HEAD', { 
                    encoding: 'utf8', 
                    timeout: 5000 
                }).trim();
                gitData['vcs.commit.id.short'] = shortCommit;
            } catch (error) {
                console.warn('Failed to get short git commit:', error.message);
            }
            
            // Get repository URL
            try {
                const remoteUrl = execSync('git config --get remote.origin.url', { 
                    encoding: 'utf8', 
                    timeout: 5000 
                }).trim();
                gitData['vcs.repository.url'] = cleanGitUrl(remoteUrl);
            } catch (error) {
                console.warn('Failed to get git remote URL:', error.message);
            }
            
            // Get commit message
            try {
                const commitMessage = execSync('git log -1 --pretty=%B', { 
                    encoding: 'utf8', 
                    timeout: 5000 
                }).trim();
                gitData['vcs.commit.message'] = commitMessage;
            } catch (error) {
                console.warn('Failed to get git commit message:', error.message);
            }
            
            // Get author information
            try {
                const authorName = execSync('git log -1 --pretty=%an', { 
                    encoding: 'utf8', 
                    timeout: 5000 
                }).trim();
                const authorEmail = execSync('git log -1 --pretty=%ae', { 
                    encoding: 'utf8', 
                    timeout: 5000 
                }).trim();
                gitData['vcs.commit.author.name'] = authorName;
                gitData['vcs.commit.author.email'] = authorEmail;
            } catch (error) {
                console.warn('Failed to get git author info:', error.message);
            }
            
            // Get commit timestamp
            try {
                const timestamp = execSync('git log -1 --pretty=%ct', { 
                    encoding: 'utf8', 
                    timeout: 5000 
                }).trim();
                gitData['vcs.commit.timestamp'] = parseInt(timestamp, 10);
            } catch (error) {
                console.warn('Failed to get git commit timestamp:', error.message);
            }
            
            // Check if working directory is dirty
            try {
                const status = execSync('git status --porcelain', { 
                    encoding: 'utf8', 
                    timeout: 5000 
                }).trim();
                gitData['vcs.working_directory.dirty'] = status.length > 0;
            } catch (error) {
                console.warn('Failed to get git status:', error.message);
            }
            
            // Get repository root path
            try {
                const repoRoot = execSync('git rev-parse --show-toplevel', { 
                    encoding: 'utf8', 
                    timeout: 5000 
                }).trim();
                gitData['vcs.repository.root'] = repoRoot;
            } catch (error) {
                console.warn('Failed to get git repository root:', error.message);
            }
            
        } finally {
            process.chdir(originalCwd);
        }
        
    } catch (error) {
        console.warn('Failed to collect VCS metadata:', error.message);
    }
    
    return gitData;
}

/**
 * Find .git directory by walking up the directory tree
 * @param {string} startDir - Starting directory
 * @returns {string|null} Path to .git directory or null if not found
 */
function findGitDirectory(startDir) {
    let currentDir = path.resolve(startDir);
    
    while (currentDir !== path.dirname(currentDir)) {
        const gitPath = path.join(currentDir, '.git');
        
        if (fs.existsSync(gitPath)) {
            return gitPath;
        }
        
        currentDir = path.dirname(currentDir);
    }
    
    return null;
}

/**
 * Clean and normalize Git URL
 * @param {string} url - Raw Git URL
 * @returns {string} Cleaned URL
 */
function cleanGitUrl(url) {
    if (!url) return '';
    
    // Remove .git suffix
    let cleanUrl = url.replace(/\.git$/, '');
    
    // Convert SSH URLs to HTTPS
    if (cleanUrl.startsWith('git@')) {
        cleanUrl = cleanUrl
            .replace(/^git@/, 'https://')
            .replace(':', '/');
    }
    
    // Remove credentials from HTTPS URLs
    cleanUrl = cleanUrl.replace(/https:\/\/[^@]+@/, 'https://');
    
    return cleanUrl;
}

/**
 * Add VCS metadata to resource attributes
 * @param {Object} resourceAttributes - Resource attributes object to modify
 * @returns {Promise<void>}
 */
async function addVCSMetadata(resourceAttributes) {
    try {
        const vcsData = getGitMetadata();
        Object.assign(resourceAttributes, vcsData);
    } catch (error) {
        console.warn('Failed to add VCS metadata:', error.message);
    }
}

/**
 * Get environment-specific VCS information
 * @returns {Object} Environment VCS data
 */
function getEnvironmentVCSData() {
    const envData = {};
    
    // Vercel deployment information
    if (process.env.VERCEL_GIT_COMMIT_SHA) {
        envData['vcs.commit.id'] = process.env.VERCEL_GIT_COMMIT_SHA;
    }
    
    if (process.env.VERCEL_GIT_COMMIT_REF) {
        envData['vcs.branch'] = process.env.VERCEL_GIT_COMMIT_REF;
    }
    
    if (process.env.VERCEL_GIT_REPO_SLUG) {
        envData['vcs.repository.name'] = process.env.VERCEL_GIT_REPO_SLUG;
    }
    
    if (process.env.VERCEL_GIT_REPO_OWNER) {
        envData['vcs.repository.owner'] = process.env.VERCEL_GIT_REPO_OWNER;
    }
    
    if (process.env.VERCEL_GIT_COMMIT_MESSAGE) {
        envData['vcs.commit.message'] = process.env.VERCEL_GIT_COMMIT_MESSAGE;
    }
    
    if (process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME) {
        envData['vcs.commit.author.name'] = process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME;
    }
    
    // GitHub Actions
    if (process.env.GITHUB_SHA) {
        envData['vcs.commit.id'] = process.env.GITHUB_SHA;
    }
    
    if (process.env.GITHUB_REF_NAME) {
        envData['vcs.branch'] = process.env.GITHUB_REF_NAME;
    }
    
    if (process.env.GITHUB_REPOSITORY) {
        envData['vcs.repository.name'] = process.env.GITHUB_REPOSITORY;
    }
    
    // GitLab CI
    if (process.env.CI_COMMIT_SHA) {
        envData['vcs.commit.id'] = process.env.CI_COMMIT_SHA;
    }
    
    if (process.env.CI_COMMIT_REF_NAME) {
        envData['vcs.branch'] = process.env.CI_COMMIT_REF_NAME;
    }
    
    if (process.env.CI_PROJECT_PATH) {
        envData['vcs.repository.name'] = process.env.CI_PROJECT_PATH;
    }
    
    return envData;
}

module.exports = {
    getGitMetadata,
    addVCSMetadata,
    getEnvironmentVCSData,
    findGitDirectory,
    cleanGitUrl
}; 