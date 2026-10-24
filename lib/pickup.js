// Order names: a unique, memorable name for every order and donation (e.g.
// AMBER-FALCON-RIVER-7342), so a client who gives no email can still collect
// their work and receipt at altradits.com/collect. The name is a key: only an
// exact match opens the order, lookups are rate-limited (api/collect.js), and
// the store keeps only its hash for the lookup.
import crypto from "node:crypto";
import { getJSON, setJSON } from "./store.js";

const WORDS = `amber anchor apple arrow aspen autumn badger bamboo banner basil beacon birch bison bloom breeze brook cactus candle canyon cedar cherry cinder citrus clover cobalt comet copper coral cosmos cotton crane crystal cypress dahlia daisy delta desert dove dragon dune eagle ember falcon fern fig finch flame forest fox frost galaxy garnet gazelle ginger glacier granite grove harbor hazel heron hickory honey horizon indigo iris ivory jade jasmine juniper kestrel kite lagoon lantern lark laurel lemon lilac lily linen lotus lunar lynx magnet mango maple marble meadow mesa meteor mint mist moss nectar nova oak oasis ocean olive onyx opal orbit orchid otter owl palm panda pearl pebble pepper petal pine planet plum pollen poppy prairie prism quail quartz rain raven reef ridge river robin ruby saffron sage salmon sand sapphire savanna sequoia shadow sierra silver sky slate sparrow spruce star stone storm summit sun swallow swan thistle thunder tiger timber topaz tulip tundra valley velvet violet walnut wave willow wind winter wolf zebra zephyr`.split(/\s+/);

export const normalize = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const keyOf = (name) => `pickup:${crypto.createHash("sha256").update(normalize(name)).digest("hex")}`;

export function makeName() {
  const w = () => WORDS[crypto.randomInt(WORDS.length)].toUpperCase();
  return `${w()}-${w()}-${w()}-${crypto.randomInt(1000, 10000)}`;
}

// Give a lead its order name (once) and index it for collection.
export async function assignPickup(lead) {
  if (lead.pickup) return lead.pickup;
  let name;
  do { name = makeName(); } while (await getJSON(keyOf(name)));
  lead.pickup = name;
  await setJSON(keyOf(name), lead.id);
  return name;
}

export async function leadIdForPickup(name) {
  const n = normalize(name);
  if (!/^[A-Z]+-[A-Z]+-[A-Z]+-\d{4}$/.test(n)) return null;
  return getJSON(keyOf(n));
}
