import path from "path";

function isPackagedExe() {
  return typeof (process as any).pkg !== "undefined";
}

function baseDir() {
  return isPackagedExe() ? path.dirname(process.execPath) : __dirname + "/../..";
}

export function getCredentialPath() {
  return path.join(baseDir(), "credential.json");
}
