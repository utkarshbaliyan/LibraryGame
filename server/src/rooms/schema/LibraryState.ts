import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("number") x: number = 400;
  @type("number") y: number = 300;
  @type("string") dir: string = "down";
  @type("boolean") moving: boolean = false;
  @type("string") username: string = "";
  @type("string") name: string = "";
  @type("number") sessionSeconds: number = 0;

  // Session system
  @type("string") pstate: string = "idle";
  @type("number") sessionMins: number = 0;
  @type("number") sessionLeft: number = 0;
  @type("number") seatId: number = -1;
  @type("number") idleSince: number = 0;

  // Character appearance
  @type("string") gender: string = "male";
  @type("number") skin:   number = 0xf5c5a3;
  @type("number") hair:   number = 0x1a0a00;
  @type("number") shirt:  number = 0xf59e0b;
  @type("number") pants:  number = 0x1e2a4a;
  @type("number") shoes:  number = 0x1a1008;
}

export class LibraryState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
