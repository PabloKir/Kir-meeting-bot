"use client";

import { useStore } from "@/lib/store";
import type { Stage } from "@/lib/types";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { SetupStage } from "@/components/Setup";
import { ParticipantsStage } from "@/components/Participants";
import { CaptureStage } from "@/components/Capture";
import { SpeakersStage } from "@/components/Speakers";
import { AnalysisStage } from "@/components/Analysis";
import {
  QuestionsStage,
  ClosureStage,
  MinuteStage,
  ImprovementsStage,
} from "@/components/Stages";

// Orden de stages para navegación lineal
const ORDER: Stage[] = [
  "setup",
  "participants",
  "capture",
  "speakers",
  "analysis",
  "questions",
  "closure",
  "minute",
  "improvements",
];

export default function Page() {
  const stage = useStore((s) => s.stage);
  const setStage = useStore((s) => s.setStage);

  const idx = ORDER.indexOf(stage);
  const back = () => idx > 0 && setStage(ORDER[idx - 1]);
  const next = () => idx < ORDER.length - 1 && setStage(ORDER[idx + 1]);

  return (
    <div
      className="grid h-screen kir-grid-bg"
      style={{ gridTemplateRows: "64px 1fr", gridTemplateColumns: "280px 1fr" }}
    >
      <div className="col-span-2">
        <Header />
      </div>
      <Sidebar />
      <main className="overflow-y-auto p-10">
        <div className="max-w-[1200px] mx-auto">
          {stage === "setup" && <SetupStage onNext={next} />}
          {stage === "participants" && <ParticipantsStage onBack={back} onNext={next} />}
          {stage === "capture" && <CaptureStage onBack={back} onNext={next} />}
          {stage === "speakers" && <SpeakersStage onBack={back} onNext={next} />}
          {stage === "analysis" && <AnalysisStage onBack={back} onNext={next} />}
          {stage === "questions" && <QuestionsStage onBack={back} onNext={next} />}
          {stage === "closure" && <ClosureStage onBack={back} onNext={next} />}
          {stage === "minute" && <MinuteStage onBack={back} onNext={next} />}
          {stage === "improvements" && <ImprovementsStage onBack={back} />}
        </div>
      </main>
    </div>
  );
}
