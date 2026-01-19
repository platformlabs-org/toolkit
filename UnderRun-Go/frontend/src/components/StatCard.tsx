import React from "react";
import { cls } from "../utils";

export function StatCard(props: {
  title: string;
  value: number;
  accent: "violet" | "cyan" | "amber" | "rose";
  changed?: boolean;
  onDoubleClick?: () => void;
}) {
  const { title, value, accent, changed, onDoubleClick } = props;
  return (
    <div className={cls("card", changed && "cardChanged")} onDoubleClick={onDoubleClick}>
      <div className="cardTop">
        <div className={cls("pill", `pill-${accent}`)}>{title}</div>
        <div className={cls("badge", changed ? "badgeHot" : "badgeMuted")}>
          {changed ? "Changed" : "Stable"}
        </div>
      </div>
      <div className="cardValue">{value}</div>
      <div className="cardHint">UnderRunCountPipe{title}</div>
    </div>
  );
}
