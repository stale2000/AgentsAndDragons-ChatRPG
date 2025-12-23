declare module '@halftheopposite/dungeon' {
  export type TileMap = number[][];
  export type DungeonResult = {
    width: number;
    height: number;
    tree: any;
    layers: {
      tiles: { map: TileMap };
      props?: { map: TileMap };
      monsters?: { map: TileMap };
    };
  };

  export function generate(config: any): DungeonResult;
}


