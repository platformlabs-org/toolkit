export type URSnapshot = {
  a: number;
  b: number;
  c: number;
  d: number;
  valid: boolean;
  ts: string;
};

export type URDiff = { pipe: "A" | "B" | "C" | "D"; prev: number; curr: number };

export type URChange = {
  prev: URSnapshot;
  curr: URSnapshot;
  diffs: URDiff[];
  changedAt: string;
};

export type ChangeRecord = {
  id: string;
  changedAt: string;
  diffs: URDiff[];
  curr: URSnapshot;
};
