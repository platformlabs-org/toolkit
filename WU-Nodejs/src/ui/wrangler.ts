import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";

export function banner(title: string, version: string) {
  console.log(chalk.bold.cyan(`\n${title} v${version}`));
}

export function section(opts: { title: string; current: number; total: number }) {
  // “1/4: Title”
  const tag = chalk.bgBlue.black(` ${opts.current}/${opts.total} `);
  console.log(`\n${tag} ${chalk.bold.white(opts.title)}`);
  console.log(chalk.gray("─".repeat(50)));
}

export function item(label: string, value?: string) {
  // “├ label / │ value …”
  if (value === undefined) {
    console.log(`${chalk.gray("├")} ${label}`);
  } else {
    console.log(`${chalk.gray("├")} ${label}`);
    console.log(`${chalk.gray("│")} ${chalk.gray("dir")} ${value}`);
  }
  console.log(chalk.gray("│"));
}

export function endLine(label: string) {
  // “╰ …”
  console.log(`${chalk.gray("╰")} ${label}`);
}

export function info(msg: string) {
  console.log(`${chalk.blue("ℹ")} ${msg}`);
}

export function ok(msg: string) {
  console.log(`${chalk.green("✅")} ${msg}`);
}

export function warn(msg: string) {
  console.log(`${chalk.yellow("⚠️")} ${msg}`);
}

export function fail(msg: string) {
  console.error(`${chalk.red("❌")} ${msg}`);
}

export async function promptText(message: string, def?: string) {
  const ans = await inquirer.prompt([
    { type: "input", name: "v", message, default: def ?? undefined }
  ]);
  return String(ans.v ?? "").trim();
}

export async function promptPassword(message: string) {
  const ans = await inquirer.prompt([
    { type: "password", name: "v", message, mask: "*" }
  ]);
  return String(ans.v ?? "");
}

export async function promptConfirm(message: string, def = true) {
  const ans = await inquirer.prompt([
    { type: "confirm", name: "v", message, default: def }
  ]);
  return !!ans.v;
}

// ─── Spinner Helpers ─────────────────────────────────────────────────────────

/**
 * Execute a promise with a spinner.
 * @param text The text to display while spinning.
 * @param action The async function to execute.
 * @returns The result of the action.
 */
export async function spin<T>(text: string, action: () => Promise<T>): Promise<T> {
  const spinner = ora({
    text: text,
    color: "cyan",
    spinner: "dots"
  }).start();

  try {
    const result = await action();
    spinner.succeed();
    return result;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

/**
 * Start a spinner and return the spinner instance for manual control.
 * @param text Initial text
 */
export function startSpinner(text: string) {
  return ora({
    text: text,
    color: "cyan",
    spinner: "dots"
  }).start();
}
