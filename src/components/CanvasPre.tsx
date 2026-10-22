import { canvasLegend, renderCanvasText, type CanvasCell, type CellCoord } from "@/lib/canvas";

type Props = {
  frameSize: number;
  cells: CanvasCell[];
  assigned?: CellCoord | null;
  className?: string;
};

export function CanvasPre({
  frameSize,
  cells,
  assigned = null,
  className,
}: Props) {
  const showAssigned = Boolean(assigned);
  const text = renderCanvasText({
    frameSize,
    cells,
    assigned,
    showAssignedLegend: showAssigned,
  });
  const legend = canvasLegend(showAssigned);

  return (
    <div className={className ? `canvas-block ${className}` : "canvas-block"}>
      <pre className="canvas-pre" tabIndex={0}>
        {text}
      </pre>
      <p className="canvas-legend">{legend}</p>
    </div>
  );
}
