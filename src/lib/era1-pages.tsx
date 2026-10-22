import { CanvasPre } from "@/components/CanvasPre";
import { getDb } from "@/db";
import {
  getFrameSize,
  loadValidCells,
  absToRowCol,
  type CellCoord,
} from "./canvas";

export async function loadCanvasView(assigned?: CellCoord | null) {
  const db = getDb();
  const frameSize = await getFrameSize(db);
  const cells = await loadValidCells(db);
  return { frameSize, cells, assigned: assigned ?? null };
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="banner">{children}</p>;
}

export function CanvasSection({
  frameSize,
  cells,
  assigned,
}: {
  frameSize: number;
  cells: Awaited<ReturnType<typeof loadValidCells>>;
  assigned?: CellCoord | null;
}) {
  return (
    <CanvasPre frameSize={frameSize} cells={cells} assigned={assigned} />
  );
}

export function cellHeading(row: number, col: number): string {
  return `Your cell is row ${row}, column ${col}. Choose what it should hold.`;
}

export { absToRowCol };
