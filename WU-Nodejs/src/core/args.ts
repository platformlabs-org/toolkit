import { Options } from "../models/types";
import { ApiException } from "../api/http";

type ArgMap = {
  flags: Set<string>;
  values: Map<string, string[]>;
  hasFlag(k: string): boolean;
  getSingle(k: string): string | null;
  getMany(k: string): string[];
};

function isFlag(a: string) {
  return (
    a === "--select-all" ||
    a === "--dry-run" ||
    a === "--schedule-go-live" ||
    a === "--auto-install-os-upgrade" ||
    a === "--no-auto-install-os-upgrade" ||
    a === "--auto-install-applicable" ||
    a === "--no-auto-install-applicable" ||
    a === "--is-disclosure-restricted" ||
    a === "--publish-to-windows10s" ||
    a === "--is-reboot-required" ||
    a === "--is-co-engineered" ||
    a === "--is-for-unreleased-hardware" ||
    a === "--has-ui-software" ||
    a === "--no-ui" ||
    a === "--no-filter"
  );
}

function parseArgs(argv: string[]): ArgMap {
  const flags = new Set<string>();
  const values = new Map<string, string[]>();

  const addValue = (k: string, v: string) => {
    const arr = values.get(k) ?? [];
    arr.push(v);
    values.set(k, arr);
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;

    if (isFlag(a)) {
      flags.add(a);
      continue;
    }

    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
      addValue(a, "");
      continue;
    }

    if (a === "--visible-to-accounts" || a === "--affected-oems" || a === "--chids") {
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        addValue(a, argv[++i]);
      }
    } else {
      addValue(a, argv[++i]);
    }
  }

  return {
    flags,
    values,
    hasFlag: (k) => flags.has(k),
    getSingle: (k) => (values.get(k)?.length ? values.get(k)![0] : null),
    getMany: (k) => values.get(k) ?? [],
  };
}

function defaultOptions(): Options {
  return {
    TenantId: null,
    ClientId: null,
    ClientSecret: null,
    ProductId: null,
    SubmissionId: null,

    SelectAll: false,
    DryRun: false,
    OutPath: "shippinglabel.request.json",

    Destination: "windowsUpdate",
    Name: null,

    GoLiveImmediate: true,
    GoLiveDate: null,

    VisibleToAccounts: [],

    AutoInstallDuringOsUpgrade: true,
    AutoInstallOnApplicableSystems: true,

    IsDisclosureRestricted: false,
    PublishToWindows10s: false,

    MsContact: "feizh@microsoft.com",
    ValidationsPerformed: "Product assurance team full range tested",
    AffectedOems: ["Lenovo"],
    IsRebootRequired: false,
    IsCoEngineered: false,
    IsForUnreleasedHardware: false,
    HasUiSoftware: false,
    BusinessJustification: "to meet MDA requirements",

    Chids: [],

    NoUi: false,
    OfferFilter: true,
  };
}

function parseIntOrThrow(flag: string, s: string) {
  const v = Number.parseInt(s, 10);
  if (!Number.isFinite(v)) throw new ApiException(`${flag} 需要整数，但输入为: ${s}`);
  return v;
}

export function parseOptions(argv: string[]): Options {
  const map = parseArgs(argv);
  const o = defaultOptions();

  o.TenantId = map.getSingle("--tenant-id");
  o.ClientId = map.getSingle("--client-id");
  o.ClientSecret = map.getSingle("--client-secret");
  o.ProductId = map.getSingle("--product-id");
  o.SubmissionId = map.getSingle("--submission-id");

  o.SelectAll = map.hasFlag("--select-all");
  o.DryRun = map.hasFlag("--dry-run");
  o.OutPath = map.getSingle("--out") ?? "shippinglabel.request.json";

  o.Destination = map.getSingle("--destination") ?? "windowsUpdate";
  o.Name = map.getSingle("--name");

  o.GoLiveImmediate = !map.hasFlag("--schedule-go-live");
  const goLiveDate = map.getSingle("--go-live-date");
  if (goLiveDate && goLiveDate.trim()) {
    o.GoLiveDate = goLiveDate;
    o.GoLiveImmediate = false;
  }

  o.VisibleToAccounts = map.getMany("--visible-to-accounts").map((x) => parseIntOrThrow("--visible-to-accounts", x));

  if (map.hasFlag("--auto-install-os-upgrade")) o.AutoInstallDuringOsUpgrade = true;
  if (map.hasFlag("--no-auto-install-os-upgrade")) o.AutoInstallDuringOsUpgrade = false;

  if (map.hasFlag("--auto-install-applicable")) o.AutoInstallOnApplicableSystems = true;
  if (map.hasFlag("--no-auto-install-applicable")) o.AutoInstallOnApplicableSystems = false;

  o.IsDisclosureRestricted = map.hasFlag("--is-disclosure-restricted");
  o.PublishToWindows10s = map.hasFlag("--publish-to-windows10s");

  const msContact = map.getSingle("--ms-contact");
  const validations = map.getSingle("--validations-performed");
  if (msContact) o.MsContact = msContact;
  if (validations) o.ValidationsPerformed = validations;

  const affected = map.getMany("--affected-oems");
  if (affected.length) o.AffectedOems = affected;

  o.IsRebootRequired = map.hasFlag("--is-reboot-required");
  o.IsCoEngineered = map.hasFlag("--is-co-engineered");
  o.IsForUnreleasedHardware = map.hasFlag("--is-for-unreleased-hardware");
  o.HasUiSoftware = map.hasFlag("--has-ui-software");

  const bj = map.getSingle("--business-justification");
  if (bj) o.BusinessJustification = bj;

  o.Chids = map.getMany("--chids");

  o.NoUi = map.hasFlag("--no-ui");
  if (map.hasFlag("--no-filter")) o.OfferFilter = false;

  return o;
}
