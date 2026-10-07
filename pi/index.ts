// Pi's native TypeScript loader loads the source directly, including in Git installs.
// No prepare script, compiler, built dist directory, or separate CLI process is needed.
export { default } from "../src/pi/extension.js";
