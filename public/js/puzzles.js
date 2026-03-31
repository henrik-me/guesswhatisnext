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

  // ─── 🌍 Geography ────────────────────────────────────────
  {
    id: "geo-continents-size",
    category: "Geography",
    difficulty: 1,
    type: "text",
    sequence: ["Asia", "Africa", "North America"],
    answer: "South America",
    options: ["Europe", "South America", "Antarctica", "Australia"],
    explanation: "Continents ordered by area from largest to smallest: Asia → Africa → N. America → S. America."
  },
  {
    id: "geo-compass-directions",
    category: "Geography",
    difficulty: 1,
    type: "text",
    sequence: ["North", "East", "South"],
    answer: "West",
    options: ["West", "Northeast", "Down", "Center"],
    explanation: "The four cardinal compass directions clockwise: North → East → South → West."
  },
  {
    id: "geo-us-states-alphabetical",
    category: "Geography",
    difficulty: 1,
    type: "text",
    sequence: ["Alabama", "Alaska", "Arizona"],
    answer: "Arkansas",
    options: ["Arkansas", "California", "Colorado", "Connecticut"],
    explanation: "US states in alphabetical order: Alabama → Alaska → Arizona → Arkansas."
  },
  {
    id: "geo-european-capitals",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["Paris", "Berlin", "Madrid"],
    answer: "Rome",
    options: ["Rome", "Milan", "Barcelona", "Munich"],
    explanation: "Capital cities of France, Germany, Spain — next is Italy's capital: Rome."
  },
  {
    id: "geo-oceans-size",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["Pacific", "Atlantic", "Indian"],
    answer: "Southern",
    options: ["Arctic", "Southern", "Mediterranean", "Caribbean"],
    explanation: "Oceans ordered by size: Pacific → Atlantic → Indian → Southern → Arctic."
  },
  {
    id: "geo-largest-countries",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["Russia", "Canada", "USA"],
    answer: "China",
    options: ["India", "China", "Brazil", "Australia"],
    explanation: "Largest countries by area: Russia → Canada → USA → China."
  },
  {
    id: "geo-asian-capitals",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["Tokyo", "Beijing", "Seoul"],
    answer: "Bangkok",
    options: ["Bangkok", "Shanghai", "Osaka", "Taipei"],
    explanation: "Capital cities of Japan, China, South Korea — next is Thailand's capital: Bangkok."
  },
  {
    id: "geo-earth-layers",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["Crust", "Mantle", "Outer Core"],
    answer: "Inner Core",
    options: ["Inner Core", "Magma", "Bedrock", "Lithosphere"],
    explanation: "Earth's layers from outside in: Crust → Mantle → Outer Core → Inner Core."
  },
  {
    id: "geo-world-population",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["India", "China", "USA"],
    answer: "Indonesia",
    options: ["Indonesia", "Brazil", "Japan", "Mexico"],
    explanation: "Most populous countries: India → China → USA → Indonesia."
  },
  {
    id: "geo-longest-rivers",
    category: "Geography",
    difficulty: 3,
    type: "text",
    sequence: ["Nile", "Amazon", "Yangtze"],
    answer: "Mississippi",
    options: ["Mississippi", "Thames", "Danube", "Rhine"],
    explanation: "World's longest rivers in order: Nile → Amazon → Yangtze → Mississippi."
  },
  {
    id: "geo-south-american-capitals",
    category: "Geography",
    difficulty: 3,
    type: "text",
    sequence: ["Brasília", "Buenos Aires", "Santiago"],
    answer: "Lima",
    options: ["Lima", "São Paulo", "Bogotá", "Rio de Janeiro"],
    explanation: "Capitals of Brazil, Argentina, Chile — next is Peru's capital: Lima."
  },
  {
    id: "geo-highest-mountains",
    category: "Geography",
    difficulty: 3,
    type: "text",
    sequence: ["Everest", "K2", "Kangchenjunga"],
    answer: "Lhotse",
    options: ["Lhotse", "Denali", "Kilimanjaro", "Mont Blanc"],
    explanation: "World's highest mountains: Everest → K2 → Kangchenjunga → Lhotse."
  },
  // ─── 📜 History ──────────────────────────────────────────
  {
    id: "hist-world-wars",
    category: "History",
    difficulty: 1,
    type: "text",
    sequence: ["1914", "1918", "1939"],
    answer: "1945",
    options: ["1945", "1950", "1941", "1942"],
    explanation: "WWI: 1914–1918, WWII: 1939–1945. The pattern shows start/end dates of both world wars."
  },
  {
    id: "hist-inventions-timeline",
    category: "History",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔥", "🏹", "⚙️"],
    answer: "💡",
    options: ["💡", "🔥", "🗡️", "🏰"],
    explanation: "Major inventions through history: fire → bow & arrow → mechanical wheel/gear → light bulb."
  },
  {
    id: "hist-transportation-evolution",
    category: "History",
    difficulty: 1,
    type: "emoji",
    sequence: ["🐴", "🚂", "🚗"],
    answer: "✈️",
    options: ["✈️", "🚲", "🛶", "🐴"],
    explanation: "Transportation evolution: horse → train → car → airplane."
  },
  {
    id: "hist-ancient-civilizations",
    category: "History",
    difficulty: 2,
    type: "text",
    sequence: ["Mesopotamia", "Egypt", "Greece"],
    answer: "Rome",
    options: ["Rome", "Aztec", "Viking", "Mongol"],
    explanation: "Major ancient civilizations in chronological order of rise: Mesopotamia → Egypt → Greece → Rome."
  },
  {
    id: "hist-us-presidents-early",
    category: "History",
    difficulty: 2,
    type: "text",
    sequence: ["Washington", "Adams", "Jefferson"],
    answer: "Madison",
    options: ["Madison", "Monroe", "Lincoln", "Hamilton"],
    explanation: "First US presidents in order: Washington → Adams → Jefferson → Madison."
  },
  {
    id: "hist-space-race",
    category: "History",
    difficulty: 2,
    type: "text",
    sequence: ["Sputnik 1957", "Gagarin 1961", "Apollo 11 1969"],
    answer: "Skylab 1973",
    options: ["Skylab 1973", "Hubble 1990", "ISS 1998", "Viking 1976"],
    explanation: "Space race milestones: Sputnik → Gagarin → Moon landing → Skylab space station."
  },
  {
    id: "hist-renaissance-to-modern",
    category: "History",
    difficulty: 2,
    type: "text",
    sequence: ["Renaissance", "Reformation", "Enlightenment"],
    answer: "Industrial Revolution",
    options: ["Industrial Revolution", "Dark Ages", "Bronze Age", "Cold War"],
    explanation: "European historical periods: Renaissance → Reformation → Enlightenment → Industrial Revolution."
  },
  {
    id: "hist-ages-of-man",
    category: "History",
    difficulty: 2,
    type: "text",
    sequence: ["Stone Age", "Bronze Age", "Iron Age"],
    answer: "Classical Age",
    options: ["Classical Age", "Digital Age", "Space Age", "Ice Age"],
    explanation: "Ages of human civilization: Stone → Bronze → Iron → Classical."
  },
  {
    id: "hist-egyptian-periods",
    category: "History",
    difficulty: 3,
    type: "text",
    sequence: ["Old Kingdom", "Middle Kingdom", "New Kingdom"],
    answer: "Late Period",
    options: ["Late Period", "Early Period", "Bronze Age", "Iron Age"],
    explanation: "Egyptian historical periods: Old Kingdom → Middle Kingdom → New Kingdom → Late Period."
  },
  {
    id: "hist-roman-empire-phases",
    category: "History",
    difficulty: 3,
    type: "text",
    sequence: ["Kingdom", "Republic", "Empire"],
    answer: "Fall",
    options: ["Fall", "Democracy", "Renaissance", "Feudalism"],
    explanation: "Phases of Roman civilization: Kingdom → Republic → Empire → Fall (476 AD)."
  },
  {
    id: "hist-writing-systems",
    category: "History",
    difficulty: 3,
    type: "text",
    sequence: ["Cuneiform", "Hieroglyphs", "Greek Alphabet"],
    answer: "Latin Alphabet",
    options: ["Latin Alphabet", "Binary", "Morse Code", "Braille"],
    explanation: "Writing systems in order of development: Cuneiform → Hieroglyphs → Greek → Latin alphabet."
  },
  // ─── 💻 Technology ───────────────────────────────────────
  {
    id: "tech-storage-evolution",
    category: "Technology",
    difficulty: 1,
    type: "emoji",
    sequence: ["💾", "💿", "🔌"],
    answer: "☁️",
    options: ["☁️", "💾", "📼", "🖨️"],
    explanation: "Storage evolution: floppy disk → CD → USB drive → cloud storage."
  },
  {
    id: "tech-mobile-generations",
    category: "Technology",
    difficulty: 1,
    type: "text",
    sequence: ["2G", "3G", "4G"],
    answer: "5G",
    options: ["5G", "6G", "4.5G", "WiFi"],
    explanation: "Mobile network generations: 2G → 3G → 4G → 5G."
  },
  {
    id: "tech-data-units",
    category: "Technology",
    difficulty: 1,
    type: "text",
    sequence: ["Byte", "Kilobyte", "Megabyte"],
    answer: "Gigabyte",
    options: ["Gigabyte", "Terabyte", "Bit", "Nibble"],
    explanation: "Data units in ascending order: Byte → Kilobyte → Megabyte → Gigabyte."
  },
  {
    id: "tech-web-versions",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["Web 1.0", "Web 2.0", "Web 3.0"],
    answer: "Web 4.0",
    options: ["Web 4.0", "Web 2.5", "Web 5.0", "Internet 2"],
    explanation: "Web evolution: static pages (1.0) → social/interactive (2.0) → decentralized (3.0) → AI-driven (4.0)."
  },
  {
    id: "tech-programming-generations",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["Machine Code", "Assembly", "C"],
    answer: "Python",
    options: ["Python", "Binary", "HTML", "Punch Cards"],
    explanation: "Programming language generations from low to high level: Machine Code → Assembly → C → Python."
  },
  {
    id: "tech-apple-devices",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["iPod", "iPhone", "iPad"],
    answer: "Apple Watch",
    options: ["Apple Watch", "iMac", "MacBook", "iTunes"],
    explanation: "Apple's major product launches in order: iPod (2001) → iPhone (2007) → iPad (2010) → Apple Watch (2015)."
  },
  {
    id: "tech-social-media-timeline",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["MySpace", "Facebook", "Twitter"],
    answer: "Instagram",
    options: ["Instagram", "Friendster", "LinkedIn", "AOL"],
    explanation: "Major social media platforms by launch: MySpace (2003) → Facebook (2004) → Twitter (2006) → Instagram (2010)."
  },
  {
    id: "tech-gaming-consoles",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["Atari", "NES", "PlayStation"],
    answer: "Xbox",
    options: ["Xbox", "Sega", "Commodore", "Pong"],
    explanation: "Landmark gaming consoles: Atari (1977) → NES (1985) → PlayStation (1994) → Xbox (2001)."
  },
  {
    id: "tech-display-resolution",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["480p", "720p", "1080p"],
    answer: "4K",
    options: ["4K", "8K", "360p", "HD"],
    explanation: "Display resolution progression: 480p → 720p → 1080p → 4K (2160p)."
  },
  {
    id: "tech-internet-protocols",
    category: "Technology",
    difficulty: 3,
    type: "text",
    sequence: ["HTTP", "HTTPS", "HTTP/2"],
    answer: "HTTP/3",
    options: ["HTTP/3", "HTTP/4", "FTP", "TCP"],
    explanation: "Web protocol evolution: HTTP → HTTPS → HTTP/2 → HTTP/3 (QUIC)."
  },
  {
    id: "tech-ai-milestones",
    category: "Technology",
    difficulty: 3,
    type: "text",
    sequence: ["Deep Blue 1997", "Watson 2011", "AlphaGo 2016"],
    answer: "ChatGPT 2022",
    options: ["ChatGPT 2022", "Siri 2011", "Alexa 2014", "Cortana 2014"],
    explanation: "AI milestones: Deep Blue beat chess → Watson beat Jeopardy → AlphaGo beat Go → ChatGPT launched."
  },
  // ─── 🎨 Art & Design ─────────────────────────────────────
  {
    id: "art-primary-colors",
    category: "Art & Design",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴", "🔵"],
    answer: "🟡",
    options: ["🟡", "🟢", "🟠", "🟣"],
    explanation: "The three primary colors in traditional color theory: Red, Blue, Yellow."
  },
  {
    id: "art-rainbow-order",
    category: "Art & Design",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴", "🟠", "🟡", "🟢"],
    answer: "🔵",
    options: ["🔵", "🟣", "⚪", "🟤"],
    explanation: "Rainbow order (ROYGBIV): Red → Orange → Yellow → Green → Blue."
  },
  {
    id: "art-color-wheel-warm",
    category: "Art & Design",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴", "🟠"],
    answer: "🟡",
    options: ["🟡", "🔵", "🟣", "🟤"],
    explanation: "Warm colors on the color wheel progress: Red → Orange → Yellow."
  },
  {
    id: "art-movements-timeline",
    category: "Art & Design",
    difficulty: 2,
    type: "text",
    sequence: ["Renaissance", "Baroque", "Impressionism"],
    answer: "Cubism",
    options: ["Cubism", "Gothic", "Romanticism", "Prehistoric"],
    explanation: "Art movements in chronological order: Renaissance → Baroque → Impressionism → Cubism."
  },
  {
    id: "art-pencil-grades",
    category: "Art & Design",
    difficulty: 2,
    type: "text",
    sequence: ["2H", "H", "HB"],
    answer: "B",
    options: ["B", "2B", "F", "3H"],
    explanation: "Pencil hardness grades from hard to soft: 2H → H → HB → B."
  },
  {
    id: "art-famous-painters",
    category: "Art & Design",
    difficulty: 2,
    type: "text",
    sequence: ["Da Vinci", "Rembrandt", "Monet"],
    answer: "Picasso",
    options: ["Picasso", "Michelangelo", "Raphael", "Vermeer"],
    explanation: "Famous painters in chronological order: Da Vinci (1500s) → Rembrandt (1600s) → Monet (1800s) → Picasso (1900s)."
  },
  {
    id: "art-photography-evolution",
    category: "Art & Design",
    difficulty: 2,
    type: "emoji",
    sequence: ["📷", "🎞️", "📸"],
    answer: "🤳",
    options: ["🤳", "🖼️", "🎨", "📹"],
    explanation: "Photography evolution: early camera → film camera → digital camera → selfie/smartphone camera."
  },
  {
    id: "art-sculpture-evolution",
    category: "Art & Design",
    difficulty: 3,
    type: "text",
    sequence: ["Greek Classical", "Roman", "Gothic"],
    answer: "Renaissance",
    options: ["Renaissance", "Prehistoric", "Modern", "Baroque"],
    explanation: "Sculpture style evolution: Greek Classical → Roman → Gothic → Renaissance."
  },
  // ─── 📝 Language & Grammar ───────────────────────────────
  {
    id: "lang-vowels",
    category: "Language & Grammar",
    difficulty: 1,
    type: "text",
    sequence: ["A", "E", "I"],
    answer: "O",
    options: ["O", "U", "B", "Y"],
    explanation: "English vowels in order: A, E, I, O, U."
  },
  {
    id: "lang-sentence-structure",
    category: "Language & Grammar",
    difficulty: 1,
    type: "text",
    sequence: ["Subject", "Verb"],
    answer: "Object",
    options: ["Object", "Adjective", "Comma", "Period"],
    explanation: "Basic English sentence structure: Subject → Verb → Object (SVO)."
  },
  {
    id: "lang-roman-numerals",
    category: "Language & Grammar",
    difficulty: 1,
    type: "text",
    sequence: ["I", "II", "III"],
    answer: "IV",
    options: ["IV", "IIII", "V", "VI"],
    explanation: "Roman numerals: I (1), II (2), III (3), IV (4)."
  },
  {
    id: "lang-tenses",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["Past", "Present"],
    answer: "Future",
    options: ["Future", "Perfect", "Pluperfect", "Conditional"],
    explanation: "The three basic tenses: Past → Present → Future."
  },
  {
    id: "lang-parts-of-speech",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["Noun", "Verb", "Adjective"],
    answer: "Adverb",
    options: ["Adverb", "Sentence", "Paragraph", "Syllable"],
    explanation: "Common parts of speech: Noun → Verb → Adjective → Adverb."
  },
  {
    id: "lang-greek-alphabet-start",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["Alpha", "Beta", "Gamma"],
    answer: "Delta",
    options: ["Delta", "Epsilon", "Omega", "Sigma"],
    explanation: "First four letters of the Greek alphabet: Alpha → Beta → Gamma → Delta."
  },
  {
    id: "lang-phonetic-alphabet",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["Alpha", "Bravo", "Charlie"],
    answer: "Delta",
    options: ["Delta", "Echo", "Dog", "David"],
    explanation: "NATO phonetic alphabet: Alpha → Bravo → Charlie → Delta."
  },
  {
    id: "lang-punctuation-hierarchy",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["Period", "Comma", "Semicolon"],
    answer: "Colon",
    options: ["Colon", "Dash", "Paragraph", "Space"],
    explanation: "Common punctuation marks: Period → Comma → Semicolon → Colon."
  },
  {
    id: "lang-prefixes-size",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["micro", "milli", "centi"],
    answer: "deci",
    options: ["deci", "kilo", "mega", "nano"],
    explanation: "Metric prefixes from smallest to largest: micro → milli → centi → deci."
  },
  // ─── 🔬 Science ──────────────────────────────────────────
  {
    id: "sci-planets-order",
    category: "Science",
    difficulty: 1,
    type: "text",
    sequence: ["Mercury", "Venus", "Earth"],
    answer: "Mars",
    options: ["Mars", "Jupiter", "Saturn", "Moon"],
    explanation: "Planets from the Sun: Mercury → Venus → Earth → Mars."
  },
  {
    id: "sci-states-of-matter",
    category: "Science",
    difficulty: 1,
    type: "text",
    sequence: ["Solid", "Liquid"],
    answer: "Gas",
    options: ["Gas", "Plasma", "Vapor", "Ice"],
    explanation: "States of matter by increasing energy: Solid → Liquid → Gas."
  },
  {
    id: "sci-scientific-method",
    category: "Science",
    difficulty: 1,
    type: "text",
    sequence: ["Question", "Hypothesis", "Experiment"],
    answer: "Conclusion",
    options: ["Conclusion", "Guess", "Theory", "Law"],
    explanation: "The scientific method: Question → Hypothesis → Experiment → Conclusion."
  },
  {
    id: "sci-periodic-first-four",
    category: "Science",
    difficulty: 2,
    type: "text",
    sequence: ["Hydrogen", "Helium", "Lithium"],
    answer: "Beryllium",
    options: ["Beryllium", "Carbon", "Boron", "Nitrogen"],
    explanation: "First elements of the periodic table: Hydrogen (1) → Helium (2) → Lithium (3) → Beryllium (4)."
  },
  {
    id: "sci-electromagnetic-spectrum",
    category: "Science",
    difficulty: 2,
    type: "text",
    sequence: ["Radio", "Microwave", "Infrared"],
    answer: "Visible Light",
    options: ["Visible Light", "X-ray", "Gamma", "Sound"],
    explanation: "EM spectrum by wavelength: Radio → Microwave → Infrared → Visible Light."
  },
  {
    id: "sci-rock-cycle",
    category: "Science",
    difficulty: 2,
    type: "text",
    sequence: ["Igneous", "Sedimentary"],
    answer: "Metamorphic",
    options: ["Metamorphic", "Calcium", "Volcanic", "Crystal"],
    explanation: "The three main rock types in the rock cycle: Igneous → Sedimentary → Metamorphic."
  },
  {
    id: "sci-human-body-systems",
    category: "Science",
    difficulty: 2,
    type: "text",
    sequence: ["Skeletal", "Muscular", "Circulatory"],
    answer: "Nervous",
    options: ["Nervous", "Battery", "Mechanical", "Digital"],
    explanation: "Major body systems: Skeletal → Muscular → Circulatory → Nervous."
  },
  {
    id: "sci-ph-scale",
    category: "Science",
    difficulty: 2,
    type: "text",
    sequence: ["Acid", "Neutral"],
    answer: "Base",
    options: ["Base", "Salt", "Water", "Ion"],
    explanation: "The pH scale goes from Acid (0-6) → Neutral (7) → Base (8-14)."
  },
  {
    id: "sci-cell-division",
    category: "Science",
    difficulty: 3,
    type: "text",
    sequence: ["Interphase", "Prophase", "Metaphase"],
    answer: "Anaphase",
    options: ["Anaphase", "Telophase", "Cytokinesis", "G1 Phase"],
    explanation: "Phases of the cell cycle during cell division: Interphase → Prophase → Metaphase → Anaphase → Telophase."
  },
  {
    id: "sci-taxonomy",
    category: "Science",
    difficulty: 3,
    type: "text",
    sequence: ["Kingdom", "Phylum", "Class"],
    answer: "Order",
    options: ["Order", "Species", "Domain", "Genus"],
    explanation: "Taxonomy hierarchy: Kingdom → Phylum → Class → Order → Family → Genus → Species."
  },
  // ─── ⚽ Sports ────────────────────────────────────────────
  {
    id: "sport-track-distances",
    category: "Sports",
    difficulty: 1,
    type: "text",
    sequence: ["100m", "200m", "400m"],
    answer: "800m",
    options: ["800m", "500m", "1000m", "300m"],
    explanation: "Standard Olympic track events: 100m → 200m → 400m → 800m (each roughly doubling)."
  },
  {
    id: "sport-medal-order",
    category: "Sports",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥇", "🥈"],
    answer: "🥉",
    options: ["🥉", "🏅", "🎖️", "⭐"],
    explanation: "Olympic medal order: Gold 🥇 → Silver 🥈 → Bronze 🥉."
  },
  {
    id: "sport-baseball-bases",
    category: "Sports",
    difficulty: 1,
    type: "text",
    sequence: ["Home", "First", "Second"],
    answer: "Third",
    options: ["Third", "Pitcher", "Outfield", "Dugout"],
    explanation: "Baseball base running order: Home → First → Second → Third."
  },
  {
    id: "sport-olympic-host-recent",
    category: "Sports",
    difficulty: 2,
    type: "text",
    sequence: ["London 2012", "Rio 2016", "Tokyo 2020"],
    answer: "Paris 2024",
    options: ["Paris 2024", "Beijing 2008", "LA 2028", "Sydney 2000"],
    explanation: "Recent Summer Olympic host cities: London → Rio → Tokyo → Paris."
  },
  {
    id: "sport-tennis-grand-slams",
    category: "Sports",
    difficulty: 2,
    type: "text",
    sequence: ["Australian Open", "French Open", "Wimbledon"],
    answer: "US Open",
    options: ["US Open", "Indian Wells", "ATP Finals", "Davis Cup"],
    explanation: "Tennis Grand Slams in calendar order: Australian Open → French Open → Wimbledon → US Open."
  },
  {
    id: "sport-karate-belts",
    category: "Sports",
    difficulty: 2,
    type: "text",
    sequence: ["White", "Yellow", "Orange"],
    answer: "Green",
    options: ["Green", "Black", "Red", "Blue"],
    explanation: "Karate belt progression: White → Yellow → Orange → Green."
  },
  {
    id: "sport-triathlon-events",
    category: "Sports",
    difficulty: 2,
    type: "emoji",
    sequence: ["🏊", "🚴"],
    answer: "🏃",
    options: ["🏃", "🏇", "⛷️", "🤸"],
    explanation: "Triathlon events in order: Swim 🏊 → Bike 🚴 → Run 🏃."
  },
  {
    id: "sport-world-cup-hosts",
    category: "Sports",
    difficulty: 3,
    type: "text",
    sequence: ["Brazil 2014", "Russia 2018", "Qatar 2022"],
    answer: "USA/Canada/Mexico 2026",
    options: ["USA/Canada/Mexico 2026", "Japan 2002", "Saudi Arabia 2034", "England 1966"],
    explanation: "Recent FIFA World Cup hosts: Brazil → Russia → Qatar → USA/Canada/Mexico."
  },
  // ─── 🍕 Food ─────────────────────────────────────────────
  {
    id: "food-courses-formal",
    category: "Food",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥗", "🍜", "🥩"],
    answer: "🍰",
    options: ["🍰", "🥗", "🍞", "🧃"],
    explanation: "Formal dinner courses: salad → soup → main course → dessert."
  },
  {
    id: "food-bread-making",
    category: "Food",
    difficulty: 1,
    type: "text",
    sequence: ["Mix", "Knead", "Rise"],
    answer: "Bake",
    options: ["Bake", "Freeze", "Fry", "Grill"],
    explanation: "Bread making steps: Mix ingredients → Knead dough → Let it Rise → Bake."
  },
  {
    id: "food-egg-cooking",
    category: "Food",
    difficulty: 1,
    type: "text",
    sequence: ["Raw", "Soft-boiled", "Medium-boiled"],
    answer: "Hard-boiled",
    options: ["Hard-boiled", "Scrambled", "Poached", "Fried"],
    explanation: "Egg doneness by cooking time: Raw → Soft-boiled → Medium-boiled → Hard-boiled."
  },
  {
    id: "food-wine-colors",
    category: "Food",
    difficulty: 1,
    type: "text",
    sequence: ["White", "Rosé"],
    answer: "Red",
    options: ["Red", "Blue", "Green", "Purple"],
    explanation: "Wine categories by color depth: White → Rosé → Red."
  },
  {
    id: "food-spice-heat",
    category: "Food",
    difficulty: 2,
    type: "emoji",
    sequence: ["🫑", "🌶️", "🌶️🌶️"],
    answer: "🌶️🌶️🌶️",
    options: ["🌶️🌶️🌶️", "🍅", "🥒", "🧊"],
    explanation: "Increasing spice levels: bell pepper (mild) → one chili → two chilies → three chilies (hot!)."
  },
  {
    id: "food-coffee-strength",
    category: "Food",
    difficulty: 2,
    type: "text",
    sequence: ["Decaf", "Americano", "Latte"],
    answer: "Espresso",
    options: ["Espresso", "Water", "Tea", "Milk"],
    explanation: "Coffee drinks by strength: Decaf → Americano → Latte → Espresso."
  },
  {
    id: "food-sushi-progression",
    category: "Food",
    difficulty: 2,
    type: "emoji",
    sequence: ["🍚", "🥢", "🐟"],
    answer: "🍣",
    options: ["🍣", "🍕", "🍔", "🌮"],
    explanation: "Making sushi: rice → chopsticks → fish → sushi roll!"
  },
  // ─── 🐾 Animals ──────────────────────────────────────────
  {
    id: "animal-size-land",
    category: "Animals",
    difficulty: 1,
    type: "emoji",
    sequence: ["🐜", "🐁", "🐈"],
    answer: "🐕",
    options: ["🐕", "🦠", "🐛", "🐜"],
    explanation: "Land animals by size: ant → mouse → cat → dog."
  },
  {
    id: "animal-life-stages-butterfly",
    category: "Animals",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥚", "🐛", "🫘"],
    answer: "🦋",
    options: ["🦋", "🐝", "🐞", "🪲"],
    explanation: "Butterfly life cycle: egg → caterpillar → chrysalis → butterfly."
  },
  {
    id: "animal-life-stages-frog",
    category: "Animals",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥚", "〰️", "🧒"],
    answer: "🐸",
    options: ["🐸", "🐍", "🦎", "🐢"],
    explanation: "Frog life cycle: egg → tadpole → froglet → adult frog (🐸)."
  },
  {
    id: "animal-fastest-land",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🐢", "🐇", "🐎"],
    answer: "🐆",
    options: ["🐆", "🐌", "🐘", "🦥"],
    explanation: "Animals by speed: turtle → rabbit → horse → cheetah (fastest land animal)."
  },
  {
    id: "animal-ocean-size",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🦐", "🐟", "🐬"],
    answer: "🐋",
    options: ["🐋", "🦑", "🐙", "🦀"],
    explanation: "Ocean creatures by size: shrimp → fish → dolphin → whale."
  },
  {
    id: "animal-bird-sizes",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🐦", "🦆", "🦢"],
    answer: "🦅",
    options: ["🦅", "🐣", "🐧", "🦜"],
    explanation: "Birds by size: sparrow → duck → swan → eagle."
  },
  // ─── 🎵 Music ────────────────────────────────────────────
  {
    id: "music-do-re-mi",
    category: "Music",
    difficulty: 1,
    type: "text",
    sequence: ["Do", "Re", "Mi"],
    answer: "Fa",
    options: ["Fa", "Sol", "La", "Ti"],
    explanation: "Solfège scale: Do, Re, Mi, Fa, Sol, La, Ti, Do."
  },
  {
    id: "music-band-formation",
    category: "Music",
    difficulty: 1,
    type: "emoji",
    sequence: ["🎸", "🥁", "🎤"],
    answer: "🎵",
    options: ["🎵", "🎹", "📻", "📢"],
    explanation: "Forming a band: guitar → drums → vocals → music! A band makes music together."
  },
  {
    id: "music-note-values",
    category: "Music",
    difficulty: 2,
    type: "text",
    sequence: ["Whole", "Half", "Quarter"],
    answer: "Eighth",
    options: ["Eighth", "Third", "Fifth", "Double"],
    explanation: "Musical note durations, each half the previous: Whole → Half → Quarter → Eighth."
  },
  {
    id: "music-instrument-families",
    category: "Music",
    difficulty: 2,
    type: "text",
    sequence: ["Strings", "Woodwinds", "Brass"],
    answer: "Percussion",
    options: ["Percussion", "Electronic", "Vocals", "Piano"],
    explanation: "Orchestra instrument families: Strings → Woodwinds → Brass → Percussion."
  },
  {
    id: "music-volume-levels",
    category: "Music",
    difficulty: 2,
    type: "text",
    sequence: ["pianissimo", "piano", "mezzo-piano"],
    answer: "mezzo-forte",
    options: ["mezzo-forte", "fortissimo", "forte", "sforzando"],
    explanation: "Musical dynamics from quiet to loud: pp → p → mp → mf."
  },
  {
    id: "music-tempo-terms",
    category: "Music",
    difficulty: 3,
    type: "text",
    sequence: ["Largo", "Adagio", "Andante"],
    answer: "Allegro",
    options: ["Allegro", "Presto", "Forte", "Piano"],
    explanation: "Musical tempo markings from slow to fast: Largo → Adagio → Andante → Allegro."
  },
  // ─── 🔢 Math & Numbers ───────────────────────────────────
  {
    id: "math-square-numbers",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["1", "4", "9", "16"],
    answer: "25",
    options: ["25", "20", "24", "36"],
    explanation: "Perfect squares: 1², 2², 3², 4², 5² = 1, 4, 9, 16, 25."
  },
  {
    id: "math-powers-of-ten",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["10", "100", "1000"],
    answer: "10000",
    options: ["10000", "5000", "10001", "2000"],
    explanation: "Powers of 10: 10¹, 10², 10³, 10⁴ = 10, 100, 1000, 10000."
  },
  {
    id: "math-negative-countdown",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["3", "2", "1", "0"],
    answer: "-1",
    options: ["-1", "-2", "00", "0.5"],
    explanation: "Counting down by 1: 3, 2, 1, 0, -1."
  },
  {
    id: "math-cube-numbers",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["1", "8", "27"],
    answer: "64",
    options: ["64", "36", "81", "100"],
    explanation: "Perfect cubes: 1³=1, 2³=8, 3³=27, 4³=64."
  },
  {
    id: "math-triangular-numbers",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["1", "3", "6", "10"],
    answer: "15",
    options: ["15", "12", "14", "20"],
    explanation: "Triangular numbers: 1, 3, 6, 10, 15. Each adds one more than the previous gap."
  },
  {
    id: "math-fractions-halving",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["1", "1/2", "1/4"],
    answer: "1/8",
    options: ["1/8", "1/3", "1/6", "1/16"],
    explanation: "Each fraction is half the previous: 1 → 1/2 → 1/4 → 1/8."
  },
  {
    id: "math-fibonacci-extended",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["5", "8", "13", "21"],
    answer: "34",
    options: ["34", "29", "32", "40"],
    explanation: "Fibonacci sequence: each number is the sum of the two before. 13+21=34."
  },
  {
    id: "math-pi-digits",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["3", "1", "4", "1"],
    answer: "5",
    options: ["5", "6", "2", "9"],
    explanation: "Digits of Pi: 3.1415926... The fifth digit is 5."
  },
  // ─── 🧩 Logic Sequences ──────────────────────────────────
  {
    id: "logic-skip-one-letter",
    category: "Logic Sequences",
    difficulty: 1,
    type: "text",
    sequence: ["A", "C", "E", "G"],
    answer: "I",
    options: ["I", "H", "J", "F"],
    explanation: "Every other letter of the alphabet: A, C, E, G, I (skipping B, D, F, H)."
  },
  {
    id: "logic-reverse-countdown",
    category: "Logic Sequences",
    difficulty: 1,
    type: "text",
    sequence: ["Z", "Y", "X", "W"],
    answer: "V",
    options: ["V", "U", "A", "T"],
    explanation: "Alphabet in reverse: Z → Y → X → W → V."
  },
  {
    id: "logic-double-letters",
    category: "Logic Sequences",
    difficulty: 2,
    type: "text",
    sequence: ["AA", "BB", "CC"],
    answer: "DD",
    options: ["DD", "EE", "AB", "CD"],
    explanation: "Each letter doubled in alphabetical order: AA → BB → CC → DD."
  },
  {
    id: "logic-multiply-three",
    category: "Logic Sequences",
    difficulty: 2,
    type: "text",
    sequence: ["2", "6", "18"],
    answer: "54",
    options: ["54", "36", "48", "72"],
    explanation: "Each number is multiplied by 3: 2 × 3 = 6, 6 × 3 = 18, 18 × 3 = 54."
  },
  {
    id: "logic-add-increasing",
    category: "Logic Sequences",
    difficulty: 2,
    type: "text",
    sequence: ["2", "3", "5", "8"],
    answer: "12",
    options: ["12", "11", "13", "10"],
    explanation: "Add increasing amounts: +1, +2, +3, +4. So 2→3→5→8→12."
  },
  {
    id: "logic-mirror-letters",
    category: "Logic Sequences",
    difficulty: 3,
    type: "text",
    sequence: ["AZ", "BY", "CX"],
    answer: "DW",
    options: ["DW", "DE", "EV", "DA"],
    explanation: "First letter goes forward A→B→C→D, second goes backward Z→Y→X→W."
  },
  // ─── 🌍 General Knowledge ────────────────────────────────
  {
    id: "gk-days-of-week",
    category: "General Knowledge",
    difficulty: 1,
    type: "text",
    sequence: ["Monday", "Tuesday", "Wednesday"],
    answer: "Thursday",
    options: ["Thursday", "Friday", "Sunday", "Saturday"],
    explanation: "Days of the week: Monday → Tuesday → Wednesday → Thursday."
  },
  {
    id: "gk-months-year",
    category: "General Knowledge",
    difficulty: 1,
    type: "text",
    sequence: ["January", "February", "March"],
    answer: "April",
    options: ["April", "May", "June", "December"],
    explanation: "Months in order: January → February → March → April."
  },
  {
    id: "gk-playing-cards",
    category: "General Knowledge",
    difficulty: 1,
    type: "text",
    sequence: ["Jack", "Queen", "King"],
    answer: "Ace",
    options: ["Ace", "Joker", "10", "2"],
    explanation: "Playing card face values: Jack → Queen → King → Ace."
  },
  {
    id: "gk-decades",
    category: "General Knowledge",
    difficulty: 1,
    type: "text",
    sequence: ["1980s", "1990s", "2000s"],
    answer: "2010s",
    options: ["2010s", "2020s", "1970s", "2050s"],
    explanation: "Consecutive decades: 1980s → 1990s → 2000s → 2010s."
  },
  {
    id: "gk-life-stages",
    category: "General Knowledge",
    difficulty: 1,
    type: "emoji",
    sequence: ["👶", "🧒", "🧑"],
    answer: "🧓",
    options: ["🧓", "👶", "🧒", "🦴"],
    explanation: "Human life stages: baby → child → adult → elderly."
  },
  {
    id: "gk-meal-times",
    category: "General Knowledge",
    difficulty: 1,
    type: "text",
    sequence: ["Breakfast", "Lunch"],
    answer: "Dinner",
    options: ["Dinner", "Brunch", "Snack", "Midnight Feast"],
    explanation: "Daily meals in order: Breakfast → Lunch → Dinner."
  },
  {
    id: "gk-zodiac-signs",
    category: "General Knowledge",
    difficulty: 2,
    type: "text",
    sequence: ["Aries", "Taurus", "Gemini"],
    answer: "Cancer",
    options: ["Cancer", "Leo", "Virgo", "Pisces"],
    explanation: "Zodiac signs in order: Aries → Taurus → Gemini → Cancer."
  },
  // ─── 😀 Emoji Sequences ──────────────────────────────────
  {
    id: "emoji-morning-routine",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["⏰", "🚿", "👔"],
    answer: "🚗",
    options: ["🚗", "😴", "🍳", "🛏️"],
    explanation: "Morning routine: alarm → shower → get dressed → drive to work."
  },
  {
    id: "emoji-cooking-process",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🛒", "🔪", "🍳"],
    answer: "🍽️",
    options: ["🍽️", "🗑️", "🛒", "🔥"],
    explanation: "Cooking process: shop → chop → cook → serve/eat."
  },
  {
    id: "emoji-plant-growth",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌧️", "🌱", "🌿"],
    answer: "🌻",
    options: ["🌻", "🍂", "🌵", "🪨"],
    explanation: "Plant growth: rain → sprout → leaves → flower."
  },
  {
    id: "emoji-weather-day",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌅", "☀️", "🌤️"],
    answer: "🌆",
    options: ["🌆", "🌃", "⛈️", "🌅"],
    explanation: "A day's weather: sunrise → sunny → partly cloudy → sunset."
  },
  {
    id: "emoji-birthday-party",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🎈", "🎂", "🕯️"],
    answer: "🎉",
    options: ["🎉", "😢", "🎈", "🍕"],
    explanation: "Birthday party: balloons → cake → blow candles → celebration!"
  },
  {
    id: "emoji-movie-night",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🎬", "🍿", "📺"],
    answer: "😴",
    options: ["😴", "🎮", "📖", "🎬"],
    explanation: "Movie night: pick a movie → popcorn → watch → fall asleep."
  },
  // ─── 🎨 Colors & Patterns ────────────────────────────────
  {
    id: "color-traffic-light",
    category: "Colors & Patterns",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴", "🟡"],
    answer: "🟢",
    options: ["🟢", "🔵", "🟠", "⚫"],
    explanation: "Traffic light sequence: Red (stop) → Yellow (caution) → Green (go)."
  },
  {
    id: "color-greyscale",
    category: "Colors & Patterns",
    difficulty: 1,
    type: "emoji",
    sequence: ["⬛", "🩶"],
    answer: "⬜",
    options: ["⬜", "🟦", "🟥", "🟫"],
    explanation: "Greyscale from dark to light: Black → Grey → White."
  },
  {
    id: "color-mixing-primary",
    category: "Colors & Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["Red + Blue = Purple", "Red + Yellow = Orange"],
    answer: "Blue + Yellow = Green",
    options: ["Blue + Yellow = Green", "Red + Green = Brown", "Blue + Red = Pink", "Yellow + Green = Lime"],
    explanation: "Primary color mixing: Red+Blue=Purple, Red+Yellow=Orange, Blue+Yellow=Green."
  },
  {
    id: "color-pattern-triple",
    category: "Colors & Patterns",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔴", "🟡", "🔵", "🔴", "🟡"],
    answer: "🔵",
    options: ["🔵", "🔴", "🟡", "🟢"],
    explanation: "Repeating pattern of three: Red, Yellow, Blue, Red, Yellow, Blue..."
  },
  // ─── ✨ Creative & Mixed ──────────────────────────────────
  {
    id: "creative-art-supplies",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["✏️", "🖍️", "🖌️"],
    answer: "🎨",
    options: ["🎨", "📏", "✂️", "📐"],
    explanation: "Art supplies progression: pencil sketch → crayon color → paint brush → palette (masterpiece)."
  },
  {
    id: "creative-emotions-positive",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["😐", "🙂", "😊"],
    answer: "😄",
    options: ["😄", "😢", "😡", "😐"],
    explanation: "Increasing happiness: neutral → slightly happy → happy → very happy."
  },
  {
    id: "creative-story-arc",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "text",
    sequence: ["Setup", "Conflict", "Climax"],
    answer: "Resolution",
    options: ["Resolution", "Sequel", "Prologue", "Epilogue"],
    explanation: "Classic story structure: Setup → Conflict → Climax → Resolution."
  },
  {
    id: "creative-house-building",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["📐", "🧱", "🪵"],
    answer: "🏠",
    options: ["🏠", "🏗️", "🔨", "🧰"],
    explanation: "Building a house: blueprint → bricks → wood framing → finished house."
  },
  // ─── 🚩 Flags ────────────────────────────────────────────
  {
    id: "flag-english-speaking",
    category: "Flags",
    difficulty: 1,
    type: "emoji",
    sequence: ["🇺🇸", "🇬🇧", "🇦🇺"],
    answer: "🇨🇦",
    options: ["🇨🇦", "🇫🇷", "🇩🇪", "🇯🇵"],
    explanation: "Major English-speaking countries: USA → UK → Australia → Canada."
  },
  {
    id: "flag-nordic-countries",
    category: "Flags",
    difficulty: 2,
    type: "emoji",
    sequence: ["🇳🇴", "🇸🇪", "🇩🇰"],
    answer: "🇫🇮",
    options: ["🇫🇮", "🇩🇪", "🇵🇱", "🇳🇱"],
    explanation: "Nordic countries: Norway → Sweden → Denmark → Finland."
  },
  {
    id: "flag-south-american",
    category: "Flags",
    difficulty: 2,
    type: "emoji",
    sequence: ["🇧🇷", "🇦🇷", "🇨🇱"],
    answer: "🇨🇴",
    options: ["🇨🇴", "🇲🇽", "🇪🇸", "🇵🇹"],
    explanation: "South American countries by population: Brazil → Argentina → Chile → Colombia."
  },
  // ─── 🎭 Pop Culture ──────────────────────────────────────
  {
    id: "pop-movie-ratings",
    category: "Pop Culture",
    difficulty: 1,
    type: "text",
    sequence: ["G", "PG", "PG-13"],
    answer: "R",
    options: ["R", "NC-17", "X", "AA"],
    explanation: "US movie ratings from least to most restrictive: G → PG → PG-13 → R."
  },
  {
    id: "pop-social-media-actions",
    category: "Pop Culture",
    difficulty: 1,
    type: "emoji",
    sequence: ["📸", "❤️", "💬"],
    answer: "🔄",
    options: ["🔄", "🗑️", "📵", "🔇"],
    explanation: "Social media engagement: post photo → like → comment → share/repost."
  },
  {
    id: "pop-gaming-levels",
    category: "Pop Culture",
    difficulty: 1,
    type: "emoji",
    sequence: ["🟢", "🟡", "🟠"],
    answer: "🔴",
    options: ["🔴", "🟣", "⚫", "⚪"],
    explanation: "Game difficulty levels: Easy (green) → Medium (yellow) → Hard (orange) → Expert (red)."
  },
  // ─── 🖼️ Visual & Spatial ────────────────────────────────
  {
    id: "visual-symmetry-shapes",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "text",
    sequence: ["▲", "■", "⬠"],
    answer: "⬡",
    options: ["⬡", "●", "★", "◆"],
    explanation: "Shapes with increasing sides: triangle (3) → square (4) → pentagon (5) → hexagon (6)."
  },
  {
    id: "visual-arrow-rotation",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "text",
    sequence: ["→", "↓", "←"],
    answer: "↑",
    options: ["↑", "↗", "↙", "⟳"],
    explanation: "Arrow rotating 90° clockwise: right → down → left → up."
  },
  {
    id: "visual-growing-dots",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "text",
    sequence: ["·", "··", "···"],
    answer: "····",
    options: ["····", "·····", "··", "·"],
    explanation: "Adding one dot each time: 1 dot, 2 dots, 3 dots, 4 dots."
  },
  // ─── 🔤 Letter & Word Patterns ───────────────────────────
  {
    id: "letter-alphabet-groups",
    category: "Letter & Word Patterns",
    difficulty: 1,
    type: "text",
    sequence: ["ABC", "DEF", "GHI"],
    answer: "JKL",
    options: ["JKL", "KLM", "HIJ", "MNO"],
    explanation: "Alphabet in groups of 3: ABC, DEF, GHI, JKL."
  },
  {
    id: "letter-word-length",
    category: "Letter & Word Patterns",
    difficulty: 1,
    type: "text",
    sequence: ["I", "am", "the"],
    answer: "best",
    options: ["best", "go", "a", "me"],
    explanation: "Words with increasing letter count: I (1) → am (2) → the (3) → best (4)."
  },
  {
    id: "letter-consonant-sequence",
    category: "Letter & Word Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["B", "C", "D", "F"],
    answer: "G",
    options: ["G", "E", "H", "J"],
    explanation: "Consonants in order, skipping vowels: B, C, D, F, G."
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
