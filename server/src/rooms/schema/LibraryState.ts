import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("number") x: number = 400;
  @type("number") y: number = 300;
  @type("string") dir: string = "down";
  @type("boolean") moving: boolean = false;
  @type("string") username: string = "";      // unique handle (for friends/search)
  @type("string") name: string = "";          // display name (shown in game world)
  @type("number") sessionSeconds: number = 0;

  // Session system
  @type("string") pstate: string = "idle";   // idle | browsing | studying
  @type("number") sessionMins: number = 0;
  @type("number") sessionLeft: number = 0;
  @type("number") seatId: number = -1;
  @type("number") idleSince: number = 0;
}

export class LibraryState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
