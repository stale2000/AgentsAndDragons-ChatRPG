import { NextResponse } from 'next/server';
import { generateHalftheoppositeDungeonWithTiles } from '@/utils/mapGeneratorDungeon';
import { generateGraphDungeonWithTiles } from '@/utils/mapGeneratorGraph';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mode = (body?.mode || 'hto') as 'hto' | 'graph';
    const gridSize = Number(body?.gridSize) || 500;
    const cellPixels = Number(body?.cellPixels) || 10;
    const step = Number(body?.step) || 10;
    const seed = String(body?.seed || 'api');
    const graph = body?.graph as Record<string, string[]> | undefined;

    if (mode === 'graph') {
      const res = generateGraphDungeonWithTiles({ gridSize, cellPixels, step, seed, graph });
      return NextResponse.json({ success: true, map: res.map, tiles: res.tiles });
    } else {
      const res = generateHalftheoppositeDungeonWithTiles({ gridSize, cellPixels, step, seed });
      return NextResponse.json({ success: true, map: res.map, tiles: res.tiles });
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'generation failed' }, { status: 500 });
  }
}


