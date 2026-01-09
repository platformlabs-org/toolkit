import chalk from "chalk";
import inquirer from "inquirer";

export type StepCtx = { title: string; current: number; total: number };

const line = "───────────────────";

export function banner(tool: string, version: string) {
  // 模仿 wrangler：云朵 + 版本 + 分割线
  console.log(`\n ${chalk.cyan("⛅️")} ${chalk.bold(tool)} ${chalk.gray(version)}`);
  console.log(chalk.gray(line));
}

export function section(step: StepCtx) {
  // “╭ … Step x of y”
  console.log("");
  console.log(
    `${chalk.gray("╭")} ${chalk.bold(step.title)} ${chalk.gray(`Step ${step.current} of ${step.total}`)}`
  );
  console.log(chalk.gray("│"));
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
