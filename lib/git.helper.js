const fs = require("fs");
const path = require("path");

const GIT_FILES = ["config", "description", "index", "shallow", "commondir"];

// Module-level cache for VCS metadata
let cachedVCS = {
  resolved: false,
};

const refpaths = (ref) => [
  `${ref}`,
  `refs/${ref}`,
  `refs/tags/${ref}`,
  `refs/heads/${ref}`,
  `refs/remotes/${ref}`,
  `refs/remotes/${ref}/HEAD`,
];

function getConfig(gitdir) {
  // We can improve efficiency later if needed.
  // TODO: read from full list of git config files
  let text = null;
  try {
    text = fs.readFileSync(`${gitdir}/config`, { encoding: "utf8" });
  } catch (error) { }
  return getGitConfig(text);
}

function getGitConfig(text) {
  let section = null;
  let subsection = null;
  let parsedConfig = text
    ? text.split("\n").map((line) => {
      let name = null;
      let value = null;

      const trimmedLine = line.trim();
      const extractedSection = extractSectionLine(trimmedLine);
      const isSection = extractedSection != null;
      if (isSection) {
        [section, subsection] = extractedSection;
      } else {
        const extractedVariable = extractVariableLine(trimmedLine);
        const isVariable = extractedVariable != null;
        if (isVariable) {
          [name, value] = extractedVariable;
        }
      }

      const path = getPath(section, subsection, name);
      return { line, isSection, section, subsection, name, value, path };
    })
    : [];
  return parsedConfig;
}

const SECTION_LINE_REGEX = /^\[([A-Za-z0-9-.]+)(?: "(.*)")?\]$/;
const SECTION_REGEX = /^[A-Za-z0-9-.]+$/;

// variable lines contain a name, and equal sign and then a value
// variable lines can also only contain a name (the implicit value is a boolean true)
// variable name is alphanumeric (ASCII) with -
// variable name starts with an alphabetic character
// variable name is case insensitive
const VARIABLE_LINE_REGEX = /^([A-Za-z][A-Za-z-]*)(?: *= *(.*))?$/;
const VARIABLE_NAME_REGEX = /^[A-Za-z][A-Za-z-]*$/;

const VARIABLE_VALUE_COMMENT_REGEX = /^(.*?)( *[#;].*)$/;

const extractSectionLine = (line) => {
  const matches = SECTION_LINE_REGEX.exec(line);
  if (matches != null) {
    const [section, subsection] = matches.slice(1);
    return [section, subsection];
  }
  return null;
};

const extractVariableLine = (line) => {
  const matches = VARIABLE_LINE_REGEX.exec(line);
  if (matches != null) {
    const [name, rawValue = "true"] = matches.slice(1);
    const valueWithoutComments = removeComments(rawValue);
    const valueWithoutQuotes = removeQuotes(valueWithoutComments);
    return [name, valueWithoutQuotes];
  }
  return null;
};

const removeComments = (rawValue) => {
  const commentMatches = VARIABLE_VALUE_COMMENT_REGEX.exec(rawValue);
  if (commentMatches == null) {
    return rawValue;
  }
  const [valueWithoutComment, comment] = commentMatches.slice(1);
  // if odd number of quotes before and after comment => comment is escaped
  if (
    hasOddNumberOfQuotes(valueWithoutComment) &&
    hasOddNumberOfQuotes(comment)
  ) {
    return `${valueWithoutComment}${comment}`;
  }
  return valueWithoutComment;
};

const hasOddNumberOfQuotes = (text) => {
  const numberOfQuotes = (text.match(/(?:^|[^\\])"/g) || []).length;
  return numberOfQuotes % 2 !== 0;
};

const removeQuotes = (text) => {
  return text.split("").reduce((newText, c, idx, text) => {
    const isQuote = c === '"' && text[idx - 1] !== "\\";
    const isEscapeForQuote = c === "\\" && text[idx + 1] === '"';
    if (isQuote || isEscapeForQuote) {
      return newText;
    }
    return newText + c;
  }, "");
};

const lower = (text) => {
  return text != null ? text.toLowerCase() : null;
};

const getPath = (section, subsection, name) => {
  return [lower(section), subsection, lower(name)]
    .filter((a) => a != null)
    .join(".");
};

function resolveRef({
  gitdir,
  ref,
  depth = undefined,
}) {
  try {
    gitdir = path.join(gitdir, ".git");
    const oid = resolveRefInternal({
      gitdir,
      ref,
      depth,
    });
    return oid;
  } catch (err) {
    err.caller = "git.resolveRef";
    throw err;
  }
}

function resolveRefInternal({
  gitdir,
  ref,
  depth,
}) {
  if (depth !== undefined) {
    depth--;
    if (depth === -1) {
      return ref;
    }
  }

  // Is it a ref pointer?
  if (ref.startsWith("ref: ")) {
    ref = ref.slice("ref: ".length);
    return resolveRefInternal({ gitdir, ref, depth });
  }

  // Is it a complete and valid SHA?
  if (ref.length === 40 && /[0-9a-f]{40}/.test(ref)) {
    return ref;
  }

  // Get packed refs map
  const packedMap = getPackedRefs({ gitdir });

  // Look in all the proper paths, in this order
  const allpaths = refpaths(ref).filter((p) => !GIT_FILES.includes(p)); // exclude git system files (#709)

  for (const refPath of allpaths) {
    let sha;
    try {
      // Try to read from file system first
      sha = fs.readFileSync(`${gitdir}/${refPath}`, { encoding: "utf8" });
    } catch (err) {
      // If file doesn't exist, try packed refs
      sha = packedMap.get(refPath);
    }

    if (sha) {
      return resolveRefInternal({ gitdir, ref: sha.trim(), depth });
    }
  }

  // Do we give up?
  throw new Error(ref);
}

function getPackedRefs({ gitdir }) {
  let text;
  try {
    text = fs.readFileSync(`${gitdir}/packed-refs`, { encoding: "utf8" });
  } catch (err) {
    // If packed-refs doesn't exist, return empty map
    text = "";
  }
  const packed = parsePackedRefs(text);
  return packed.refs;
}

function parsePackedRefs(text) {
  let refs = new Map();
  let parsedConfig = [];

  if (text) {
    let key = null;
    parsedConfig = text
      .trim()
      .split("\n")
      .map((line) => {
        if (/^\s*#/.test(line)) {
          return { line, comment: true };
        }
        const i = line.indexOf(" ");
        if (line.startsWith("^")) {
          // This is a oid for the commit associated with the annotated tag immediately preceding this line.
          // Trim off the '^'
          const value = line.slice(1);
          // The tagname^{} syntax is based on the output of `git show-ref --tags -d`
          refs.set(key + "^{}", value);
          return { line, ref: key, peeled: value };
        } else {
          // This is an oid followed by the ref name
          const value = line.slice(0, i);
          key = line.slice(i + 1);
          refs.set(key, value);
          return { line, ref: key, oid: value };
        }
      });
  }

  return { refs, parsedConfig };
}

function listRemotes({ gitdir }) {
  gitdir = path.join(gitdir, ".git");
  const config = getConfig(gitdir);
  const remoteNames = getSubsections(config, "remote");
  const remotes = remoteNames.map((remote) => {
    const url = getConfigValue(config, `remote.${remote}.url`);
    return { remote, url };
  });
  return remotes;
}

// This is straight from parse_unit_factor in config.c of canonical git
const num = (val) => {
  if (typeof val === "number") {
    return val;
  }

  val = val.toLowerCase();
  let n = parseInt(val);
  if (val.endsWith("k")) n *= 1024;
  if (val.endsWith("m")) n *= 1024 * 1024;
  if (val.endsWith("g")) n *= 1024 * 1024 * 1024;
  return n;
};

// This is straight from git_parse_maybe_bool_text in config.c of canonical git
const bool = (val) => {
  if (typeof val === "boolean") {
    return val;
  }

  val = val.trim().toLowerCase();
  if (val === "true" || val === "yes" || val === "on") return true;
  if (val === "false" || val === "no" || val === "off") return false;
  throw Error(
    `Expected 'true', 'false', 'yes', 'no', 'on', or 'off', but got ${val}`
  );
};

const schema = {
  core: {
    filemode: bool,
    bare: bool,
    logallrefupdates: bool,
    symlinks: bool,
    ignorecase: bool,
    bigFileThreshold: num,
  },
};

function getConfigValue(parsedconfig, path, getall = false) {
  const normalizedPath = normalizePath(path).path;
  const allValues = parsedconfig
    .filter((config) => config.path === normalizedPath)
    .map(({ section, name, value }) => {
      const fn = schema[section] && schema[section][name];
      return fn ? fn(value) : value;
    });
  return getall ? allValues : allValues.pop();
}

function getSubsections(parsedConfig, section) {
  return parsedConfig
    .filter((config) => config.isSection && config.section === section)
    .map((config) => config.subsection);
}

const normalizePath = (path) => {
  const pathSegments = path.split(".");
  const section = pathSegments.shift();
  const name = pathSegments.pop();
  const subsection = pathSegments.length ? pathSegments.join(".") : undefined;

  return {
    section,
    subsection,
    name,
    path: getPath(section, subsection, name),
    sectionPath: getPath(section, subsection, null),
    isSection: !!section,
  };
};

// Helper to find the git root directory
function findGitRoot(startDir) {
  let dir = startDir;
  while (true) {
    try {
      if (fs.existsSync(path.join(dir, ".git"))) {
        return dir;
      }
    } catch (e) {
      // ignore
    }
    const parentDir = path.dirname(dir);
    if (parentDir === dir) break;
    dir = parentDir;
  }
  return null;
}

function getVercelGitInfo() {
  let gitProvider = process.env.VERCEL_GIT_PROVIDER;
  if (gitProvider === "bitbucket") gitProvider += ".org";
  else gitProvider += ".com";

  const repoOwner = process.env.VERCEL_GIT_REPO_OWNER;
  const repoName = process.env.VERCEL_GIT_REPO_SLUG;
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;

  const url = gitProvider && repoOwner && repoName ? `https://${gitProvider}/${repoOwner}/${repoName}` : "";
  const sha = commit ? commit : "";

  return { url, sha };
}

function resolveVCSInfo(resourceAttributes) {
  if (cachedVCS.resolved) return { sha: cachedVCS.sha, url: cachedVCS.url };

  const vercelGitInfo = getVercelGitInfo();

  let sha = process.env.MW_VCS_COMMIT_SHA;
  let url = process.env.MW_VCS_REPOSITORY_URL;

  if (!url && resourceAttributes?.["vcs.repository_url"])
    url = resourceAttributes?.["vcs.repository_url"];
  if (!url && vercelGitInfo.url) url = vercelGitInfo.url;

  if (!sha && resourceAttributes?.["vcs.commit_sha"])
    sha = resourceAttributes?.["vcs.commit_sha"];

  if (!sha && vercelGitInfo.sha) sha = vercelGitInfo.sha;

  // Then check for git repository
  const repoDir = findGitRoot(process.cwd());

  if (!sha && repoDir) {
    try {
      sha = resolveRef({ gitdir: repoDir, ref: "HEAD" });
    } catch { }
  }
  if (!url && repoDir) {
    try {
      const remotes = listRemotes({ gitdir: repoDir });
      const origin = remotes.find(
        (r) => r.remote === "origin"
      );
      url = origin ? origin.url : undefined;
      if (url) url = url.replace(/\.git$/, "");
    } catch { }
  }
  cachedVCS = { sha, url, resolved: true };
  return { sha, url };
}

function addVCSMetadata(resourceAttributes) {
  const { sha, url } = resolveVCSInfo(resourceAttributes);
  if (sha)
    resourceAttributes["vcs.commit_sha"] = sha;

  if (url)
    resourceAttributes["vcs.repository_url"] = url;

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

module.exports = { addVCSMetadata, getEnvironmentVCSData };