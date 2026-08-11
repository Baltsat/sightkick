import { createRoot } from 'react-dom/client';
import { Stave, StaveNote } from 'vexflow';
import type { Measure, RenderData } from '../../../src/chart-parser/types';
import {
  FlowMeter,
  LoopEscapeRunway,
  type LoopEscapeRunwayModel,
} from '../../../src/renderer/components/ContinuousNotation';
import { TutorHud } from '../../../src/renderer/components/TutorHud';
import { createTutorState } from '../../../src/renderer/services/tutor';
import '../../../src/renderer/components/ContinuousNotation/ContinuousNotation.css';
import '../../../src/renderer/components/TutorHud/TutorHud.css';
import './resonance-runway-harness.css';

type ProofState = 'retained' | 'anchor' | 'release';

function measureData(index: number): RenderData {
  const x = index * 236;
  const note = { isRest: () => true } as unknown as StaveNote;
  const stave = {
    getX: () => x,
    getWidth: () => 220,
    getY: () => 0,
    getHeight: () => 110,
  } as unknown as Stave;

  return {
    measure: {
      startTick: index * 480,
      endTick: (index + 1) * 480,
      timeSig: [4, 4],
      isCompound: false,
    } as Measure,
    stave,
    renderedNotes: [{ tick: index * 480, note }],
    yOffset: 0,
  };
}

const state = new URLSearchParams(window.location.search).get(
  'state',
) as ProofState | null;
const proofState: ProofState =
  state === 'retained' || state === 'release' ? state : 'anchor';
const renderData = Array.from({ length: 4 }, (_, index) => measureData(index));
const modelByState: Record<ProofState, LoopEscapeRunwayModel> = {
  retained: {
    barStart: 2,
    barEnd: 3,
    qualityProgress: 1,
    requiredCleanPasses: 2,
    currentSpeed: 0.7,
    targetSpeed: 0.9,
    retainedQuality: true,
  },
  anchor: {
    barStart: 2,
    barEnd: 3,
    qualityProgress: 1,
    requiredCleanPasses: 2,
    currentSpeed: 0.7,
    targetSpeed: 0.9,
  },
  release: {
    barStart: 2,
    barEnd: 3,
    qualityProgress: 2,
    requiredCleanPasses: 2,
    currentSpeed: 0.9,
    targetSpeed: 1,
    phase: 'release',
  },
};
const captionByState: Record<ProofState, { title: string; detail: string }> = {
  retained: {
    title: 'Near-clean quality retained',
    detail: '1.0 of 2 passes remains banked at 0.7×.',
  },
  anchor: {
    title: 'First anchor acquired',
    detail: '1.0 of 2 verified passes at 0.7×.',
  },
  release: {
    title: 'Loop released',
    detail: 'Two verified passes earned this exit at 0.9×.',
  },
};

function Staff() {
  return (
    <svg className="proof-staff" viewBox="0 0 944 160" aria-hidden="true">
      {[28, 44, 60, 76, 92].map((y) => (
        <line key={y} x1="0" y1={y} x2="944" y2={y} />
      ))}
      {[0, 236, 472, 708, 944].map((x) => (
        <line
          className="proof-staff__bar"
          key={x}
          x1={x}
          y1="20"
          x2={x}
          y2="120"
        />
      ))}
      {[80, 144, 198, 315, 380, 432, 550, 614, 668, 784, 850].map(
        (x, index) => (
          <g key={x} transform={`translate(${x} ${index % 3 === 0 ? 74 : 60})`}>
            <circle r="7" />
            <line x1="7" y1="0" x2="7" y2="-42" />
          </g>
        ),
      )}
    </svg>
  );
}

function ProofSurface() {
  const model = modelByState[proofState];

  return (
    <main className="proof-shell" data-proof-state={proofState}>
      <header className="proof-toolbar">
        <span className="proof-toolbar__eyebrow">Practice mode</span>
        <strong>Alternating Singles</strong>
        <span>Flow · 0.7×</span>
      </header>
      <section className="proof-viewport drumroll-flow-viewport">
        <div className="proof-notation drumroll-flow-notation">
          <div className="proof-stage drumroll-flow-stage drumroll-flow-stage--loop-escape">
            <div className="proof-score drumroll-flow-score">
              <FlowMeter renderData={renderData} />
              <LoopEscapeRunway renderData={renderData} model={model} />
              <Staff />
            </div>
          </div>
        </div>
        <TutorHud
          state={createTutorState({ enabled: false })}
          message={{ title: 'Coach loop', detail: 'Unused', tone: 'recovery' }}
          recoveryCaption={captionByState[proofState]}
        />
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<ProofSurface />);
