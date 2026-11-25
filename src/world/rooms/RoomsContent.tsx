import type { Layout } from "../layout";
import { Restaurant } from "./Restaurant";
import { Cafe } from "./Cafe";
import { GymFx } from "./GymFx";
import { AngerRoom } from "./AngerRoom";
import { SponsorRoom } from "./SponsorRoom";
import { UnityPod } from "../../unity/UnityPod";

/** Cosmetic content of the restaurant, gym, anger room and sponsor room, plus the Unity pod (the door to the optional public lobby). Everything here is optional fun: it only reads the layout and positions. */
export function RoomsContent({ layout }: { layout: Layout }) {
  return (
    <>
      <Restaurant layout={layout} />
      <Cafe layout={layout} />
      <GymFx layout={layout} />
      <AngerRoom layout={layout} />
      <SponsorRoom layout={layout} />
      <UnityPod layout={layout} />
    </>
  );
}
