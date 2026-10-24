// Order names: a unique, memorable name for every order and donation (e.g.
// AMBER-FALCON-RIVER-MAPLE-7342), so a client who gives no email can still
// collect their work and receipt at altradits.com/collect. The name is a key:
// four words from about 400 plus four digits (~47 bits), only an exact match
// opens the order, lookups are rate-limited per connection and site-wide
// (api/collect.js), and the store keeps only its hash.
import crypto from "node:crypto";
import { getJSON, setJSON } from "./store.js";

const WORDS = `acorn agate alder alpine amber amethyst anchor anise apple apricot arbor arctic argon arrow aspen aster atlas aurora autumn avocado azure badger balsam bamboo banner banyan barley basil basin bay beacon beech beryl birch bison bloom bluebell bonsai boulder bramble brass breeze brindle bronze brook buckeye buffalo butte buttercup cactus calico camel camellia canary candle canopy canyon caramel cardinal caribou carnation cascade cashew cassia catkin cedar cerulean chamomile cherry chestnut chiffon chinook cinder cinnamon citrus clay cliff cloud clover coastal cobalt cocoa coconut comet condor copper coral cork cormorant cosmos cotton cove coyote cranberry crane crescent cricket crimson crocus crystal current cypress daffodil dahlia daisy dandelion dawn deer delta desert dew dolphin dove dragon driftwood dune dusk eagle eclipse egret elder elk elm ember emerald estuary evergreen fable falcon fawn feather fennel fern fig finch fjord flame flax flint forest forge fountain fox foxglove freesia frond frost galaxy gale garden garnet gazelle gecko geyser ginger glacier glade glen glow goldfinch gorge grain granite grape gravel grove gull harbor harvest hawk hazel heather hemlock heron hibiscus hickory hollow holly honey horizon hummingbird hyacinth ibis iceberg indigo inlet iris island ivory ivy jade jaguar jasmine jay jetty jewel juniper kelp kestrel kingfisher kite kiwi koala lagoon lake lantern larch lark laurel lava lavender leaf lemon leopard lichen lilac lily lime linden linen lotus lunar lupine lynx magnet magnolia mallow manatee mango mangrove maple marble marigold marsh meadow meerkat melon mesa meteor mimosa mint mirage mist monsoon moon moor moss mulberry myrtle narwhal nebula nectar nettle nimbus nova nutmeg oak oasis ocean ocelot olive onyx opal orange orbit orchid osprey otter owl oyster palm panda papaya parrot peach pearl pebble pelican peony pepper persimmon petal pewter pheasant pine pinecone planet plover plum pollen pomelo pond poppy porcupine prairie primrose prism puffin pumpkin quail quartz quill quince rain rapids raspberry raven redwood reed reef rhubarb ridge river robin rosemary rowan ruby rye sable saffron sage salmon sand sandpiper sapphire satin savanna scarlet sea seal sedge sequoia shadow shell shore sierra silver sky slate sorrel sparrow spice spring spruce squall star stone storm stream summit sun sundew sunflower swallow swan tamarind tangerine teal tern thistle thunder tide tiger timber topaz toucan trail trout tulip tulipwood tundra turquoise twilight umber valley vanilla velvet vine violet walnut walrus waterfall wave wheat whisper willow wind winter wolf wren yarrow yew zebra zephyr`.split(/\s+/);

export const normalize = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const keyOf = (name) => `pickup:${crypto.createHash("sha256").update(normalize(name)).digest("hex")}`;

export function makeName() {
  const w = () => WORDS[crypto.randomInt(WORDS.length)].toUpperCase();
  return `${w()}-${w()}-${w()}-${w()}-${crypto.randomInt(1000, 10000)}`;
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
  if (!/^([A-Z]+-){3,4}\d{4}$/.test(n)) return null; // four words (three in the first names issued)
  return getJSON(keyOf(n));
}
