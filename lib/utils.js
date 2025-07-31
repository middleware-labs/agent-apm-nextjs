export function jsonToString(json) {
  let output = "";
  let error = false;
  try {
    output = JSON.stringify(json);
  } catch (ex) {
    error = true;
    // ignore error
  }

  if (error) {
    try {
      output = stringifySafe(json);
    } catch (ex) {
      // ignore error
    }
  }

  return output;
}

export function getPackageVersion(fallbackVersion = "0.0.0") {
  try {
    const packageJsonPath = join(__dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return packageJson.version || fallbackVersion;
  } catch (error) {
    return fallbackVersion;
  }
}
