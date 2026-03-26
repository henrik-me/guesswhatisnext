/**
 * Puzzles — Puzzle data and helpers.
 * Each puzzle is a plain object with a consistent schema.
 */

/** All puzzles. */
export const puzzles = [
  // ─── 🌿 Nature ────────────────────────────────────────────
  {
    id: "moon-phases",
    category: "Nature",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌑", "🌒", "🌓", "🌔"],
    answer: "🌕",
    options: ["🌗", "🌕", "🌑", "⭐"],
    explanation: "The moon phases progress from new moon to full moon: 🌑 🌒 🌓 🌔 🌕."
  },
  {
    id: "four-seasons",
    category: "Nature",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌸", "☀️", "🍂"],
    answer: "❄️",
    options: ["🌸", "🌪️", "❄️", "🌈"],
    explanation: "The four seasons cycle: spring 🌸, summer ☀️, autumn 🍂, winter ❄️."
  },
  {
    id: "plant-life-cycle",
    category: "Nature",
    difficulty: 2,
    type: "emoji",
    sequence: ["🌱", "🪴", "🌿", "🌳"],
    answer: "🍂",
    options: ["🌻", "🍂", "🌱", "🪨"],
    explanation: "A plant grows from seedling to tree, then its leaves fall in autumn: 🌱 → 🪴 → 🌿 → 🌳 → 🍂."
  },
  {
    id: "water-cycle",
    category: "Nature",
    difficulty: 2,
    type: "emoji",
    sequence: ["🌊", "☀️", "☁️", "🌧️"],
    answer: "🌊",
    options: ["❄️", "🌈", "🌊", "⚡"],
    explanation: "The water cycle: ocean 🌊 evaporates in sun ☀️, forms clouds ☁️, rains 🌧️, and returns to the ocean 🌊."
  },
  {
    id: "weather-worsening",
    category: "Nature",
    difficulty: 1,
    type: "emoji",
    sequence: ["☀️", "⛅", "☁️", "🌧️"],
    answer: "⛈️",
    options: ["🌤️", "⛈️", "❄️", "🌈"],
    explanation: "Weather getting progressively worse: sunny → partly cloudy → overcast → rain → thunderstorm."
  },
  {
    id: "ocean-depth",
    category: "Nature",
    difficulty: 2,
    type: "emoji",
    sequence: ["🏖️", "🐚", "🐠", "🐙"],
    answer: "🦑",
    options: ["🦈", "🦑", "🐳", "🦀"],
    explanation: "Diving deeper into the ocean: beach → shells → reef fish → octopus → giant squid in the deep."
  },
  {
    id: "food-chain",
    category: "Nature",
    difficulty: 3,
    type: "emoji",
    sequence: ["🌿", "🐛", "🐸", "🐍"],
    answer: "🦅",
    options: ["🐛", "🦅", "🐸", "🐍"],
    explanation: "A food chain: plants → insect → frog → snake → eagle. Each animal eats the one before it."
  },
  {
    id: "erosion-cycle",
    category: "Nature",
    difficulty: 2,
    type: "emoji",
    sequence: ["🏔️", "🌧️", "🏞️", "🏜️"],
    answer: "🪨",
    options: ["🌋", "🏖️", "🪨", "❄️"],
    explanation: "Erosion over time: mountain → rain wears it down → valley forms → desert → bare rock remains."
  },

  // ─── 🔢 Math & Numbers ────────────────────────────────────
  {
    id: "counting-up",
    category: "Math & Numbers",
    difficulty: 1,
    type: "emoji",
    sequence: ["1️⃣", "2️⃣", "3️⃣", "4️⃣"],
    answer: "5️⃣",
    options: ["6️⃣", "5️⃣", "4️⃣", "0️⃣"],
    explanation: "Simple counting: each number increases by one."
  },
  {
    id: "even-numbers",
    category: "Math & Numbers",
    difficulty: 1,
    type: "emoji",
    sequence: ["2️⃣", "4️⃣", "6️⃣", "8️⃣"],
    answer: "🔟",
    options: ["9️⃣", "🔟", "3️⃣", "5️⃣"],
    explanation: "Even numbers: 2, 4, 6, 8, 10. Each number increases by 2."
  },
  {
    id: "fibonacci-dots",
    category: "Math & Numbers",
    difficulty: 3,
    type: "emoji",
    sequence: ["⚀", "⚀", "⚁", "⚂"],
    answer: "⚄",
    options: ["⚃", "⚄", "⚅", "⚁"],
    explanation: "Fibonacci sequence on dice faces: 1, 1, 2, 3, 5. Each number is the sum of the two before it."
  },
  {
    id: "triangle-numbers",
    category: "Math & Numbers",
    difficulty: 3,
    type: "emoji",
    sequence: ["🔴", "🔴🔴🔴", "🔴🔴🔴🔴🔴🔴"],
    answer: "🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴",
    options: ["🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴", "🔴🔴🔴🔴🔴🔴🔴🔴", "🔴🔴🔴🔴🔴🔴🔴", "🔴🔴🔴🔴🔴🔴🔴🔴🔴"],
    explanation: "Triangle numbers: 1, 3, 6, 10. Each term adds one more than the previous gap (1 → +2 → +3 → +4)."
  },
  {
    id: "odd-numbers",
    category: "Math & Numbers",
    difficulty: 1,
    type: "emoji",
    sequence: ["1️⃣", "3️⃣", "5️⃣", "7️⃣"],
    answer: "9️⃣",
    options: ["8️⃣", "9️⃣", "🔟", "6️⃣"],
    explanation: "Odd numbers: 1, 3, 5, 7, 9. Each number increases by 2."
  },
  {
    id: "countdown",
    category: "Math & Numbers",
    difficulty: 1,
    type: "emoji",
    sequence: ["5️⃣", "4️⃣", "3️⃣", "2️⃣"],
    answer: "1️⃣",
    options: ["0️⃣", "1️⃣", "3️⃣", "6️⃣"],
    explanation: "Countdown: 5, 4, 3, 2, 1! Each number decreases by one."
  },
  {
    id: "dice-sequence",
    category: "Math & Numbers",
    difficulty: 1,
    type: "emoji",
    sequence: ["⚀", "⚁", "⚂", "⚃"],
    answer: "⚄",
    options: ["⚄", "⚅", "⚁", "⚃"],
    explanation: "Dice faces counting up: 1, 2, 3, 4, 5. Each die shows one more dot."
  },
  {
    id: "tens-countdown",
    category: "Math & Numbers",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔟", "8️⃣", "6️⃣", "4️⃣"],
    answer: "2️⃣",
    options: ["3️⃣", "1️⃣", "2️⃣", "0️⃣"],
    explanation: "Counting down by twos: 10, 8, 6, 4, 2."
  },

  // ─── 🎨 Colors & Patterns ─────────────────────────────────
  {
    id: "rainbow-order",
    category: "Colors & Patterns",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴", "🟠", "🟡", "🟢"],
    answer: "🔵",
    options: ["🟣", "⚫", "🔵", "🟤"],
    explanation: "The rainbow: red, orange, yellow, green, blue — ROY G BIV."
  },
  {
    id: "traffic-light",
    category: "Colors & Patterns",
    difficulty: 1,
    type: "emoji",
    sequence: ["🟢", "🟡", "🔴", "🟢"],
    answer: "🟡",
    options: ["🔴", "🟢", "🟡", "⚫"],
    explanation: "A traffic light cycles: green → yellow → red, then repeats. After 🟢, comes 🟡."
  },
  {
    id: "alternating-shapes",
    category: "Colors & Patterns",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔺", "🔵", "🔺", "🔵", "🔺"],
    answer: "🔵",
    options: ["🔺", "🟢", "🔵", "⬛"],
    explanation: "A simple alternating pattern: triangle, circle, triangle, circle, triangle, circle."
  },
  {
    id: "growing-hearts",
    category: "Colors & Patterns",
    difficulty: 2,
    type: "emoji",
    sequence: ["🤍", "💛", "🧡", "❤️"],
    answer: "💜",
    options: ["💚", "💜", "💙", "🖤"],
    explanation: "Hearts warming up in color intensity (white → yellow → orange → red), then cool into purple 💜."
  },
  {
    id: "checkerboard",
    category: "Colors & Patterns",
    difficulty: 1,
    type: "emoji",
    sequence: ["⬛", "⬜", "⬛", "⬜", "⬛"],
    answer: "⬜",
    options: ["⬛", "🟫", "⬜", "🔲"],
    explanation: "Alternating black and white squares like a checkerboard: ⬛ ⬜ ⬛ ⬜ ⬛ ⬜."
  },
  {
    id: "warm-to-cool",
    category: "Colors & Patterns",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔴", "🟠", "🟡", "🟢", "🔵"],
    answer: "🟣",
    options: ["⚫", "🟣", "🔴", "⬜"],
    explanation: "Full color spectrum from warm to cool: red → orange → yellow → green → blue → purple."
  },

  // ─── 🌍 General Knowledge ─────────────────────────────────
  {
    id: "weekdays",
    category: "General Knowledge",
    difficulty: 1,
    type: "emoji",
    sequence: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"],
    answer: "6️⃣",
    options: ["7️⃣", "0️⃣", "6️⃣", "8️⃣"],
    explanation: "Days of the week numbered Monday(1) through Friday(5) — Saturday is day 6️⃣."
  },
  {
    id: "solar-system",
    category: "General Knowledge",
    difficulty: 2,
    type: "emoji",
    sequence: ["☀️", "🪨", "🌍", "🔴"],
    answer: "🪐",
    options: ["🌙", "🪐", "⭐", "☄️"],
    explanation: "Planets from the Sun outward: Mercury 🪨, Earth 🌍, Mars 🔴, Jupiter 🪐 (the ringed gas giant)."
  },
  {
    id: "meal-times",
    category: "General Knowledge",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥐", "🥗", "🍝"],
    answer: "🍨",
    options: ["🍨", "🥐", "🍳", "🫖"],
    explanation: "A day's meals: breakfast 🥐, lunch 🥗, dinner 🍝, then dessert 🍨."
  },
  {
    id: "human-life-stages",
    category: "General Knowledge",
    difficulty: 2,
    type: "emoji",
    sequence: ["👶", "🧒", "🧑", "🧓"],
    answer: "👴",
    options: ["👶", "🧑", "👴", "👼"],
    explanation: "Stages of life: baby 👶, child 🧒, adult 🧑, older adult 🧓, elderly 👴."
  },
  {
    id: "compass-clockwise",
    category: "General Knowledge",
    difficulty: 2,
    type: "emoji",
    sequence: ["⬆️", "➡️", "⬇️", "⬅️"],
    answer: "⬆️",
    options: ["↗️", "⬆️", "⬇️", "↙️"],
    explanation: "Compass rotating clockwise: North ⬆️, East ➡️, South ⬇️, West ⬅️, then back to North ⬆️."
  },
  {
    id: "zodiac-order",
    category: "General Knowledge",
    difficulty: 3,
    type: "emoji",
    sequence: ["♈", "♉", "♊", "♋"],
    answer: "♌",
    options: ["♍", "♌", "♎", "♈"],
    explanation: "Zodiac signs in order: Aries ♈, Taurus ♉, Gemini ♊, Cancer ♋, Leo ♌."
  },
  {
    id: "card-suits",
    category: "General Knowledge",
    difficulty: 3,
    type: "emoji",
    sequence: ["♠️", "♥️", "♦️", "♣️"],
    answer: "♠️",
    options: ["♥️", "♠️", "♦️", "♣️"],
    explanation: "Standard card suit order: spades, hearts, diamonds, clubs — then the cycle repeats with spades."
  },
  {
    id: "traffic-signs",
    category: "General Knowledge",
    difficulty: 1,
    type: "emoji",
    sequence: ["🚫", "⚠️", "✅", "🚫"],
    answer: "⚠️",
    options: ["✅", "🚫", "⚠️", "🔴"],
    explanation: "Traffic signal cycle: stop 🚫 → caution ⚠️ → go ✅ → stop 🚫 → caution ⚠️."
  },

  // ─── 😀 Emoji Sequences ───────────────────────────────────
  {
    id: "sunrise-to-night",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌅", "☀️", "🌇"],
    answer: "🌙",
    options: ["⭐", "🌅", "🌙", "🌤️"],
    explanation: "A day passes: sunrise 🌅, midday ☀️, sunset 🌇, night 🌙."
  },
  {
    id: "rocket-launch",
    category: "Emoji Sequences",
    difficulty: 2,
    type: "emoji",
    sequence: ["🏗️", "🚀", "🌤️", "☁️"],
    answer: "🌌",
    options: ["🌍", "🌌", "💥", "🏗️"],
    explanation: "A rocket journey: construction 🏗️, launch 🚀, sky 🌤️, clouds ☁️, then outer space 🌌."
  },
  {
    id: "cooking-sequence",
    category: "Emoji Sequences",
    difficulty: 2,
    type: "emoji",
    sequence: ["🌾", "🫗", "🥣", "🔥"],
    answer: "🍞",
    options: ["🍞", "🧈", "🌾", "🫗"],
    explanation: "Baking bread: harvest grain 🌾, pour/mix ingredients 🫗, make dough 🥣, bake in fire 🔥, get bread 🍞."
  },
  {
    id: "caterpillar-to-butterfly",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥚", "🐛", "🫘"],
    answer: "🦋",
    options: ["🐝", "🐜", "🦋", "🕷️"],
    explanation: "Butterfly metamorphosis: egg 🥚, caterpillar 🐛, cocoon 🫘, then butterfly 🦋."
  },
  {
    id: "evolving-transport",
    category: "Emoji Sequences",
    difficulty: 2,
    type: "emoji",
    sequence: ["🚶", "🐎", "🚗", "✈️"],
    answer: "🚀",
    options: ["🚲", "🚀", "🚢", "🚂"],
    explanation: "Transportation evolution: walking → horse → car → airplane → rocket."
  },
  {
    id: "building-a-house",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌲", "🪵", "🔨", "🏠"],
    answer: "🏡",
    options: ["🏗️", "🏡", "🏚️", "🪵"],
    explanation: "Building a home: tree → lumber → hammer/build → house → home with garden."
  },
  {
    id: "phase-changes",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🧊", "💧", "🔥", "💨"],
    answer: "☁️",
    options: ["🌊", "❄️", "☁️", "🫧"],
    explanation: "Heating water through phases: ice → water → fire heats it → steam → clouds form."
  },
  {
    id: "letter-delivery",
    category: "Emoji Sequences",
    difficulty: 2,
    type: "emoji",
    sequence: ["✍️", "📝", "✉️", "📮"],
    answer: "📬",
    options: ["📭", "📬", "📦", "🗑️"],
    explanation: "Sending a letter: write → draft → seal in envelope → post in mailbox → delivered 📬."
  },

  // ─── 🖼️ Image Puzzles ───────────────────────────────────────
  {
    id: "shapes-sides",
    category: "Colors & Patterns",
    difficulty: 2,
    type: "image",
    sequence: ["img/shapes/triangle.svg", "img/shapes/square.svg", "img/shapes/pentagon.svg"],
    answer: "img/shapes/hexagon.svg",
    options: ["img/shapes/hexagon.svg", "img/shapes/circle.svg", "img/shapes/star.svg", "img/shapes/triangle.svg"],
    explanation: "Each shape has one more side: triangle (3) → square (4) → pentagon (5) → hexagon (6)."
  },
  {
    id: "color-spectrum",
    category: "Colors & Patterns",
    difficulty: 1,
    type: "image",
    sequence: ["img/colors/red.svg", "img/colors/orange.svg", "img/colors/yellow.svg"],
    answer: "img/colors/green.svg",
    options: ["img/colors/purple.svg", "img/colors/green.svg", "img/colors/red.svg", "img/colors/blue.svg"],
    explanation: "Following the color spectrum (rainbow order): red → orange → yellow → green."
  },

  // ─── 🎵 Music ─────────────────────────────────────────────
  {
    id: "music-volume",
    category: "Music",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔇", "🔈", "🔉", "🔊"],
    answer: "📣",
    options: ["🔇", "📣", "🔔", "🎵"],
    explanation: "Volume increasing: muted → quiet → medium → loud → megaphone! Each step gets louder."
  },
  {
    id: "instrument-evolution",
    category: "Music",
    difficulty: 2,
    type: "emoji",
    sequence: ["🥁", "🎺", "🎻", "🎹"],
    answer: "🎸",
    options: ["🎤", "🎸", "🪘", "🎺"],
    explanation: "Musical instruments through history: drums → trumpet → violin → piano → electric guitar."
  },
  {
    id: "concert-night",
    category: "Music",
    difficulty: 2,
    type: "emoji",
    sequence: ["🎫", "🚗", "🏟️", "🎸"],
    answer: "🎆",
    options: ["🎫", "🎆", "🏠", "🎤"],
    explanation: "A concert night: buy ticket → drive there → arrive at venue → watch the show → fireworks finale."
  },
  {
    id: "music-creation",
    category: "Music",
    difficulty: 3,
    type: "emoji",
    sequence: ["✍️", "🎼", "🎤", "🎧"],
    answer: "💿",
    options: ["📻", "💿", "🎵", "✍️"],
    explanation: "Music production pipeline: write lyrics → compose score → record vocals → mix/master → release album."
  },
  {
    id: "dance-party",
    category: "Music",
    difficulty: 1,
    type: "emoji",
    sequence: ["💃", "🕺", "💃", "🕺"],
    answer: "💃",
    options: ["🕺", "🎵", "💃", "🎶"],
    explanation: "Alternating dancers: woman, man, woman, man — next is woman 💃."
  },
  {
    id: "radio-to-streaming",
    category: "Music",
    difficulty: 2,
    type: "emoji",
    sequence: ["📻", "📼", "💿", "📱"],
    answer: "🎧",
    options: ["📺", "🎧", "📻", "💿"],
    explanation: "Music format evolution: radio → cassette tape → CD → smartphone → wireless headphones/streaming."
  },

  // ─── 🚩 Flags ─────────────────────────────────────────────
  {
    id: "olympic-rings",
    category: "Flags",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔵", "🟡", "⬛", "🟢"],
    answer: "🔴",
    options: ["🟣", "⬜", "🔴", "🟤"],
    explanation: "The five Olympic ring colors in order: blue, yellow, black, green, red."
  },
  {
    id: "racing-sequence",
    category: "Flags",
    difficulty: 1,
    type: "emoji",
    sequence: ["🏎️", "🟢", "🟡", "🔴"],
    answer: "🏁",
    options: ["🏳️", "🏁", "🏴", "🚩"],
    explanation: "Race flag sequence: car ready → green (go) → yellow (caution) → red (stop) → checkered (finish)."
  },
  {
    id: "flag-alternating",
    category: "Flags",
    difficulty: 1,
    type: "emoji",
    sequence: ["🏳️", "🏴", "🏳️", "🏴"],
    answer: "🏳️",
    options: ["🏁", "🚩", "🏳️", "🏴"],
    explanation: "Alternating flags: white, black, white, black — next is white 🏳️."
  },
  {
    id: "signal-alert-level",
    category: "Flags",
    difficulty: 2,
    type: "emoji",
    sequence: ["🟢", "🟢", "🟡", "🔴", "🔴"],
    answer: "🟢",
    options: ["🟡", "🟢", "⬛", "⬜"],
    explanation: "Alert level cycle: safe (green ×2) → warning (yellow) → danger (red ×2) → back to safe (green)."
  },
  {
    id: "pirate-treasure",
    category: "Flags",
    difficulty: 2,
    type: "emoji",
    sequence: ["🏴‍☠️", "🗺️", "⛵", "🏝️"],
    answer: "💰",
    options: ["🦜", "💰", "🏴‍☠️", "🗡️"],
    explanation: "Pirate treasure hunt: hoist the flag → read the map → sail the seas → reach the island → find treasure!"
  },
  {
    id: "race-to-finish",
    category: "Flags",
    difficulty: 3,
    type: "emoji",
    sequence: ["🏎️", "🟢", "🏁", "🏆", "🥇"],
    answer: "🍾",
    options: ["🏎️", "🍾", "🟢", "🏁"],
    explanation: "Complete race story: car → green flag → checkered flag → trophy → gold medal → champagne celebration."
  },

  // ─── 🔬 Science ───────────────────────────────────────────
  {
    id: "telescope-zoom",
    category: "Science",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔭", "🌙", "🪐", "⭐"],
    answer: "🌌",
    options: ["☀️", "🌌", "⭐", "🔭"],
    explanation: "Looking deeper into space: telescope → Moon → planets → stars → distant galaxies."
  },
  {
    id: "atom-to-universe",
    category: "Science",
    difficulty: 3,
    type: "emoji",
    sequence: ["⚛️", "🧬", "🦠", "🌍"],
    answer: "⭐",
    options: ["🌙", "⭐", "🔬", "🧪"],
    explanation: "Scale of the universe: atom → DNA → cell → Earth → star. Each is vastly larger than the last."
  },
  {
    id: "scientific-method",
    category: "Science",
    difficulty: 2,
    type: "emoji",
    sequence: ["❓", "🔬", "📊", "💡"],
    answer: "📝",
    options: ["❓", "📝", "🧪", "🔬"],
    explanation: "The scientific method: question → experiment → analyze data → insight → publish findings."
  },
  {
    id: "evolution-of-life",
    category: "Science",
    difficulty: 3,
    type: "emoji",
    sequence: ["🦠", "🐟", "🦎", "🐒"],
    answer: "🧑",
    options: ["🐍", "🦍", "🧑", "🐕"],
    explanation: "Evolution of life: microbe → fish → reptile → primate → modern human."
  },
  {
    id: "lab-experiment",
    category: "Science",
    difficulty: 1,
    type: "emoji",
    sequence: ["🧪", "🔬", "📋", "✅"],
    answer: "🎓",
    options: ["🧪", "🎓", "🔥", "📋"],
    explanation: "Lab process: test tube → microscope → record results → verify → graduate with discovery!"
  },
  {
    id: "planet-sizes",
    category: "Science",
    difficulty: 2,
    type: "emoji",
    sequence: ["🪨", "🌍", "🪐", "☀️"],
    answer: "💫",
    options: ["🌙", "💫", "🌌", "⭐"],
    explanation: "Celestial objects by increasing size: asteroid → Earth → Jupiter → Sun → solar system."
  },
  {
    id: "electricity-cycle",
    category: "Science",
    difficulty: 2,
    type: "emoji",
    sequence: ["⚡", "💡", "🔌", "🏭"],
    answer: "⚡",
    options: ["💡", "⚡", "🔋", "🏠"],
    explanation: "Electricity cycle: power generated ⚡ → lights up 💡 → through the grid 🔌 → power plant 🏭 → generates again ⚡."
  },

  // ─── ⚽ Sports ────────────────────────────────────────────
  {
    id: "race-to-gold",
    category: "Sports",
    difficulty: 1,
    type: "emoji",
    sequence: ["🏃", "🏁", "🥉", "🥈"],
    answer: "🥇",
    options: ["🏆", "🏃", "🥇", "🎖️"],
    explanation: "Climbing the ranks: race → finish line → bronze → silver → gold medal!"
  },
  {
    id: "ball-size-growing",
    category: "Sports",
    difficulty: 2,
    type: "emoji",
    sequence: ["🏓", "🎾", "⚾", "⚽"],
    answer: "🏀",
    options: ["🏐", "🏀", "🎱", "🏓"],
    explanation: "Sport balls by increasing size: ping pong → tennis → baseball → soccer → basketball."
  },
  {
    id: "workout-routine",
    category: "Sports",
    difficulty: 1,
    type: "emoji",
    sequence: ["🏃", "🏋️", "🧘", "😴"],
    answer: "🏃",
    options: ["🧘", "🏃", "🏋️", "🍎"],
    explanation: "Daily fitness cycle: run → lift weights → yoga/stretch → sleep → run again the next day."
  },
  {
    id: "soccer-goal-cycle",
    category: "Sports",
    difficulty: 2,
    type: "emoji",
    sequence: ["⚽", "🦵", "🥅", "🎉"],
    answer: "⚽",
    options: ["🏃", "⚽", "🥅", "🏆"],
    explanation: "Scoring a goal repeats: ball → kick → goal → celebrate → back to kickoff with the ball."
  },
  {
    id: "triathlon",
    category: "Sports",
    difficulty: 2,
    type: "emoji",
    sequence: ["🏊", "🚴", "🏃"],
    answer: "🏅",
    options: ["🏋️", "🎿", "🏅", "⚽"],
    explanation: "The triathlon: swim → bike → run → earn a medal! Three events, one race."
  },
  {
    id: "martial-arts-belts",
    category: "Sports",
    difficulty: 3,
    type: "emoji",
    sequence: ["⬜", "🟡", "🟢", "🔵"],
    answer: "🔴",
    options: ["🟤", "⬛", "🔴", "🟣"],
    explanation: "Martial arts belt progression: white → yellow → green → blue → red. Moving toward mastery."
  },

  // ─── 🍕 Food ──────────────────────────────────────────────
  {
    id: "fruit-rainbow",
    category: "Food",
    difficulty: 1,
    type: "emoji",
    sequence: ["🍎", "🍊", "🍋", "🥝"],
    answer: "🫐",
    options: ["🍇", "🫐", "🍌", "🍉"],
    explanation: "Fruits in rainbow color order: red apple → orange → lemon (yellow) → kiwi (green) → blueberry."
  },
  {
    id: "pizza-making",
    category: "Food",
    difficulty: 1,
    type: "emoji",
    sequence: ["🫓", "🍅", "🧀", "🔥"],
    answer: "🍕",
    options: ["🍕", "🫓", "🧀", "🥖"],
    explanation: "Making pizza: dough → tomato sauce → cheese → bake in oven → pizza!"
  },
  {
    id: "meal-prep",
    category: "Food",
    difficulty: 2,
    type: "emoji",
    sequence: ["🛒", "🥕", "🔪", "🍳"],
    answer: "🍽️",
    options: ["🛒", "🍽️", "🥕", "🔥"],
    explanation: "Cooking process: shop for groceries → gather ingredients → chop → cook → serve on a plate."
  },
  {
    id: "sushi-making",
    category: "Food",
    difficulty: 3,
    type: "emoji",
    sequence: ["🍚", "🐟", "🥒", "🔪"],
    answer: "🍣",
    options: ["🍱", "🍣", "🍚", "🥢"],
    explanation: "Making sushi: prepare rice → select fish → add cucumber → slice and roll → sushi is served!"
  },
  {
    id: "cake-baking",
    category: "Food",
    difficulty: 2,
    type: "emoji",
    sequence: ["🥚", "🫗", "🥣", "🔥"],
    answer: "🎂",
    options: ["🧁", "🎂", "🍩", "🥧"],
    explanation: "Baking a cake: crack eggs → pour/mix → batter → bake → birthday cake!"
  },
  {
    id: "seed-to-sandwich",
    category: "Food",
    difficulty: 2,
    type: "emoji",
    sequence: ["🌰", "🌱", "🌾", "🍞"],
    answer: "🥪",
    options: ["🍕", "🥪", "🌰", "🌾"],
    explanation: "Farm to table: seed → sprout → wheat → bread → sandwich."
  },
  {
    id: "fruit-to-pie",
    category: "Food",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌱", "🌿", "🌸", "🍎"],
    answer: "🥧",
    options: ["🍏", "🥧", "🌱", "🌸"],
    explanation: "Apple pie journey: plant → grow → blossom → harvest fruit → bake a pie!"
  },

  // ─── 🐾 Animals ───────────────────────────────────────────
  {
    id: "animal-size",
    category: "Animals",
    difficulty: 1,
    type: "emoji",
    sequence: ["🐜", "🐁", "🐈", "🐕"],
    answer: "🐎",
    options: ["🐁", "🐎", "🐛", "🐈"],
    explanation: "Animals by increasing size: ant → mouse → cat → dog → horse."
  },
  {
    id: "ocean-animals-size",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🦐", "🐟", "🐬", "🦈"],
    answer: "🐋",
    options: ["🐠", "🐋", "🦑", "🦐"],
    explanation: "Ocean creatures by size: shrimp → fish → dolphin → shark → blue whale."
  },
  {
    id: "animal-speed",
    category: "Animals",
    difficulty: 3,
    type: "emoji",
    sequence: ["🐌", "🐢", "🐇", "🐎"],
    answer: "🐆",
    options: ["🦥", "🐆", "🐕", "🐇"],
    explanation: "Animals by increasing speed: snail → turtle → rabbit → horse → cheetah (fastest land animal)."
  },
  {
    id: "pet-parade",
    category: "Animals",
    difficulty: 1,
    type: "emoji",
    sequence: ["🐕", "🐈", "🐹", "🐰"],
    answer: "🐟",
    options: ["🐕", "🐟", "🦁", "🐍"],
    explanation: "Most popular pets in order: dog → cat → hamster → rabbit → fish."
  },
  {
    id: "animal-legs",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🐍", "🐔", "🐈", "🐜"],
    answer: "🕷️",
    options: ["🦎", "🕷️", "🐕", "🐍"],
    explanation: "Animals by leg count: snake (0) → chicken (2) → cat (4) → ant (6) → spider (8)."
  },
  {
    id: "egg-to-chicken",
    category: "Animals",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥚", "🐣", "🐥", "🐓"],
    answer: "🥚",
    options: ["🦆", "🥚", "🐧", "🐣"],
    explanation: "Chicken life cycle: egg → hatching → chick → rooster → back to egg. Which came first?"
  },
  {
    id: "dinosaur-to-bird",
    category: "Animals",
    difficulty: 3,
    type: "emoji",
    sequence: ["🦕", "🦖", "☄️", "🦴"],
    answer: "🐔",
    options: ["🐊", "🐔", "🦎", "🐍"],
    explanation: "Dinosaur era to modern day: sauropod → T-rex → asteroid strike → fossils → birds evolved (chickens are dinosaur descendants)!"
  },

  // ─── 🎭 Pop Culture ───────────────────────────────────────
  {
    id: "movie-night",
    category: "Pop Culture",
    difficulty: 1,
    type: "emoji",
    sequence: ["🍿", "🎬", "🎥", "🎞️"],
    answer: "🌟",
    options: ["🍿", "🌟", "🎬", "📺"],
    explanation: "Movie night: popcorn → action/clapperboard → camera rolls → film plays → star rating review."
  },
  {
    id: "social-media-post",
    category: "Pop Culture",
    difficulty: 2,
    type: "emoji",
    sequence: ["📷", "🤳", "✍️", "📱"],
    answer: "❤️",
    options: ["📱", "❤️", "📷", "🤳"],
    explanation: "Social media workflow: take photo → selfie → write caption → post to phone → get likes/hearts."
  },
  {
    id: "gaming-progression",
    category: "Pop Culture",
    difficulty: 2,
    type: "emoji",
    sequence: ["🎮", "💀", "🎮", "🏆"],
    answer: "🎉",
    options: ["💀", "🎉", "🎮", "😤"],
    explanation: "The gamer's journey: play → game over → retry → finally win → celebrate!"
  },
  {
    id: "binge-watching",
    category: "Pop Culture",
    difficulty: 1,
    type: "emoji",
    sequence: ["📺", "📺", "📺", "😴"],
    answer: "📺",
    options: ["📱", "📺", "🎬", "😴"],
    explanation: "Binge-watching cycle: watch → watch → watch → fall asleep → wake up and watch again."
  },
  {
    id: "superhero-origin",
    category: "Pop Culture",
    difficulty: 3,
    type: "emoji",
    sequence: ["👶", "⚡", "🦸", "😈", "💥"],
    answer: "🏆",
    options: ["🦹", "🏆", "👶", "😈"],
    explanation: "Superhero story arc: born → gain powers → become hero → villain appears → epic battle → triumph!"
  },
  {
    id: "viral-trend",
    category: "Pop Culture",
    difficulty: 2,
    type: "emoji",
    sequence: ["📱", "🎵", "💃", "📈"],
    answer: "🌍",
    options: ["📉", "🌍", "📱", "💃"],
    explanation: "A viral trend: phone → catchy song → dance challenge → trending upward → goes worldwide."
  },
];

/** Get unique category names from the puzzle set. */
export function getCategories(puzzleList) {
  return [...new Set(puzzleList.map(p => p.category))].sort();
}

/** Filter puzzles by category. Returns all if category is null. */
export function filterByCategory(puzzleList, category) {
  if (!category) return [...puzzleList];
  return puzzleList.filter(p => p.category === category);
}

/** Validate a puzzle object has all required fields. */
export function validatePuzzle(puzzle) {
  const required = ['id', 'category', 'difficulty', 'type', 'sequence', 'answer', 'options', 'explanation'];
  const missing = required.filter(f => !(f in puzzle));

  if (missing.length > 0) {
    return { valid: false, error: `Missing fields: ${missing.join(', ')}` };
  }
  if (!puzzle.options.includes(puzzle.answer)) {
    return { valid: false, error: 'Answer not found in options' };
  }
  if (puzzle.options.length !== 4) {
    return { valid: false, error: `Expected 4 options, got ${puzzle.options.length}` };
  }
  return { valid: true };
}
