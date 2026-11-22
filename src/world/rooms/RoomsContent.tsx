import type { Layout } from "../layout";
import { Restaurant } from "./Restaurant";
import { Cafe } from "./Cafe";
import { GymFx } from "./GymFx";
import { AngerRoom } from "./AngerRoom";
import { SponsorRoom } from "./SponsorRoom";

/** Cosmetic content of the restaurant, gym, anger room and sponsor room. Everything here is optional fun: it only reads the layout and positions. */
export function RoomsContent({ layout }: { layout: Layout }) {
  return (
    <>
      <Restaurant layout={layout} />
      <Cafe layout={layout} />
      <GymFx layout={layout} />
      <AngerRoom layout={layout} />
      <SponsorRoom layout={layout} />
    </>
  );
}
