/**
 * Server-side puzzle pool — source of truth for database seeding.
 * Complete set of all puzzles in CommonJS format.
 */

module.exports = [
  // ─── Nature ────────────────────────────────────────────
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

  // ─── Math & Numbers ────────────────────────────────────
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

  // ─── Colors & Patterns ─────────────────────────────────
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

  // ─── General Knowledge ─────────────────────────────────
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

  // ─── Emoji Sequences ───────────────────────────────────
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

  // ─── Image Puzzles ─────────────────────────────────────
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

  // ─── Music ─────────────────────────────────────────────
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

  // ─── Flags ─────────────────────────────────────────────
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

  // ─── Science ───────────────────────────────────────────
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

  // ─── Sports ────────────────────────────────────────────
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

  // ─── Food ──────────────────────────────────────────────
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

  // ─── Animals ───────────────────────────────────────────
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

  // ─── Pop Culture ───────────────────────────────────────
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

  // ─── Math & Numbers (expanded) ──────────────────────────
  {
    id: "powers-of-two",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["1", "2", "4", "8"],
    answer: "16",
    options: ["10", "12", "16", "14"],
    explanation: "Each number doubles: 1, 2, 4, 8, 16 (powers of 2)."
  },
  {
    id: "square-numbers",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["1", "4", "9", "16"],
    answer: "25",
    options: ["20", "25", "24", "36"],
    explanation: "Perfect squares: 1², 2², 3², 4², 5² = 25."
  },
  {
    id: "cube-numbers",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["1", "8", "27", "64"],
    answer: "125",
    options: ["100", "125", "81", "216"],
    explanation: "Perfect cubes: 1³, 2³, 3³, 4³, 5³ = 125."
  },
  {
    id: "fibonacci-sequence",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["1", "1", "2", "3", "5"],
    answer: "8",
    options: ["6", "7", "8", "10"],
    explanation: "Fibonacci: each number is the sum of the two before it. 3 + 5 = 8."
  },
  {
    id: "prime-numbers",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["2", "3", "5", "7", "11"],
    answer: "13",
    options: ["12", "13", "14", "15"],
    explanation: "Prime numbers in order: 2, 3, 5, 7, 11, 13."
  },
  {
    id: "triangular-numbers",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["1", "3", "6", "10"],
    answer: "15",
    options: ["12", "14", "15", "16"],
    explanation: "Triangular numbers: 1, 3, 6, 10, 15. Each adds one more than the previous increment."
  },
  {
    id: "arithmetic-plus-three",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["2", "5", "8", "11"],
    answer: "14",
    options: ["12", "13", "14", "15"],
    explanation: "Add 3 each time: 2, 5, 8, 11, 14."
  },
  {
    id: "arithmetic-plus-seven",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["3", "10", "17", "24"],
    answer: "31",
    options: ["28", "30", "31", "33"],
    explanation: "Add 7 each time: 3, 10, 17, 24, 31."
  },
  {
    id: "geometric-times-three",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["2", "6", "18", "54"],
    answer: "162",
    options: ["108", "162", "216", "150"],
    explanation: "Multiply by 3 each time: 2, 6, 18, 54, 162."
  },
  {
    id: "descending-halves",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["256", "128", "64", "32"],
    answer: "16",
    options: ["8", "16", "24", "20"],
    explanation: "Each number is half the previous: 256, 128, 64, 32, 16."
  },
  {
    id: "alternating-add-sub",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["2", "5", "3", "6", "4"],
    answer: "7",
    options: ["5", "6", "7", "8"],
    explanation: "Alternating +3 and −2: 2 (+3) 5 (−2) 3 (+3) 6 (−2) 4 (+3) 7."
  },
  {
    id: "double-plus-one",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["1", "3", "7", "15"],
    answer: "31",
    options: ["28", "30", "31", "32"],
    explanation: "Double and add 1: 1×2+1=3, 3×2+1=7, 7×2+1=15, 15×2+1=31."
  },
  {
    id: "increasing-gaps",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["1", "2", "4", "7", "11"],
    answer: "16",
    options: ["14", "15", "16", "17"],
    explanation: "Gaps increase by 1 each time: +1, +2, +3, +4, +5. So 11 + 5 = 16."
  },
  {
    id: "factorial-sequence",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["1", "2", "6", "24"],
    answer: "120",
    options: ["48", "72", "120", "100"],
    explanation: "Factorials: 1!, 2!, 3!, 4!, 5! = 120."
  },

  // ─── Letter & Word Patterns (new category) ─────────────
  {
    id: "vowels-in-order",
    category: "Letter & Word Patterns",
    difficulty: 1,
    type: "text",
    sequence: ["A", "E", "I", "O"],
    answer: "U",
    options: ["U", "Y", "W", "P"],
    explanation: "The five vowels in order: A, E, I, O, U."
  },
  {
    id: "alphabet-skip-one",
    category: "Letter & Word Patterns",
    difficulty: 1,
    type: "text",
    sequence: ["A", "C", "E", "G"],
    answer: "I",
    options: ["H", "I", "J", "K"],
    explanation: "Every other letter of the alphabet: A, C, E, G, I."
  },
  {
    id: "alphabet-skip-two",
    category: "Letter & Word Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["A", "D", "G", "J"],
    answer: "M",
    options: ["K", "L", "M", "N"],
    explanation: "Skip two letters each time: A (+3) D (+3) G (+3) J (+3) M."
  },
  {
    id: "reverse-alphabet",
    category: "Letter & Word Patterns",
    difficulty: 1,
    type: "text",
    sequence: ["Z", "Y", "X", "W"],
    answer: "V",
    options: ["U", "V", "T", "S"],
    explanation: "The alphabet in reverse: Z, Y, X, W, V."
  },
  {
    id: "consonants-in-order",
    category: "Letter & Word Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["B", "C", "D", "F", "G"],
    answer: "H",
    options: ["H", "I", "J", "K"],
    explanation: "Consonants in alphabetical order, skipping vowels: B, C, D, F, G, H."
  },
  {
    id: "days-first-letters",
    category: "Letter & Word Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["M", "T", "W", "T"],
    answer: "F",
    options: ["E", "F", "S", "R"],
    explanation: "First letters of weekdays: Monday, Tuesday, Wednesday, Thursday, Friday."
  },
  {
    id: "planet-initials",
    category: "Letter & Word Patterns",
    difficulty: 3,
    type: "text",
    sequence: ["M", "V", "E", "M"],
    answer: "J",
    options: ["J", "S", "N", "U"],
    explanation: "First letters of planets from the Sun: Mercury, Venus, Earth, Mars, Jupiter."
  },
  {
    id: "month-initials",
    category: "Letter & Word Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["J", "F", "M", "A"],
    answer: "M",
    options: ["J", "M", "A", "N"],
    explanation: "First letters of months: January, February, March, April, May."
  },
  {
    id: "roman-numerals-ascending",
    category: "Letter & Word Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["I", "II", "III", "IV"],
    answer: "V",
    options: ["V", "VI", "X", "C"],
    explanation: "Roman numerals counting up: I (1), II (2), III (3), IV (4), V (5)."
  },
  {
    id: "double-letters",
    category: "Letter & Word Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["AA", "BB", "CC", "DD"],
    answer: "EE",
    options: ["EE", "FF", "DE", "AB"],
    explanation: "Doubled letters progressing through the alphabet: AA, BB, CC, DD, EE."
  },
  {
    id: "musical-notes",
    category: "Letter & Word Patterns",
    difficulty: 1,
    type: "text",
    sequence: ["C", "D", "E", "F"],
    answer: "G",
    options: ["G", "A", "B", "H"],
    explanation: "Musical notes on the C major scale: C, D, E, F, G."
  },
  {
    id: "word-length-growth",
    category: "Letter & Word Patterns",
    difficulty: 3,
    type: "text",
    sequence: ["I", "am", "the", "best"],
    answer: "today",
    options: ["now", "today", "here", "so"],
    explanation: "Each word has one more letter: I (1), am (2), the (3), best (4), today (5)."
  },
  {
    id: "nato-alphabet-start",
    category: "Letter & Word Patterns",
    difficulty: 3,
    type: "text",
    sequence: ["Alfa", "Bravo", "Charlie", "Delta"],
    answer: "Echo",
    options: ["Eagle", "Echo", "Edward", "Epsilon"],
    explanation: "NATO phonetic alphabet: Alfa, Bravo, Charlie, Delta, Echo."
  },
  {
    id: "alphabet-pairs",
    category: "Letter & Word Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["AB", "CD", "EF", "GH"],
    answer: "IJ",
    options: ["HI", "IJ", "IK", "JK"],
    explanation: "Consecutive alphabet pairs: AB, CD, EF, GH, IJ."
  },
  {
    id: "alternating-vowel-consonant",
    category: "Letter & Word Patterns",
    difficulty: 3,
    type: "text",
    sequence: ["A", "B", "E", "F", "I"],
    answer: "J",
    options: ["G", "H", "J", "K"],
    explanation: "Pattern: vowel, next consonant, next vowel, next consonant. A, B, E, F, I, J."
  },
  {
    id: "mirror-alphabet",
    category: "Letter & Word Patterns",
    difficulty: 3,
    type: "text",
    sequence: ["A-Z", "B-Y", "C-X", "D-W"],
    answer: "E-V",
    options: ["E-V", "E-U", "F-V", "D-X"],
    explanation: "Pairing from both ends of the alphabet: A-Z, B-Y, C-X, D-W, E-V."
  },

  // ─── Logic Sequences (new category) ────────────────────
  {
    id: "binary-counting",
    category: "Logic Sequences",
    difficulty: 2,
    type: "text",
    sequence: ["001", "010", "011", "100"],
    answer: "101",
    options: ["101", "110", "111", "000"],
    explanation: "Binary counting: 1, 2, 3, 4, 5 in binary = 001, 010, 011, 100, 101."
  },
  {
    id: "traffic-light-cycle",
    category: "Logic Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🟢", "🟡", "🔴", "🟢"],
    answer: "🟡",
    options: ["🟢", "🟡", "🔴", "⚪"],
    explanation: "Traffic light cycle repeats: green → yellow → red → green → yellow."
  },
  {
    id: "rock-paper-scissors",
    category: "Logic Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["✊", "✋", "✌️", "✊"],
    answer: "✋",
    options: ["✊", "✋", "✌️", "👊"],
    explanation: "Rock-paper-scissors cycle repeats: rock, paper, scissors, rock, paper."
  },
  {
    id: "clock-hours-by-three",
    category: "Logic Sequences",
    difficulty: 1,
    type: "text",
    sequence: ["3:00", "6:00", "9:00"],
    answer: "12:00",
    options: ["10:00", "11:00", "12:00", "1:00"],
    explanation: "Clock positions going by 3 hours: 3:00, 6:00, 9:00, 12:00."
  },
  {
    id: "logic-xo-pattern",
    category: "Logic Sequences",
    difficulty: 1,
    type: "text",
    sequence: ["X", "O", "X", "O"],
    answer: "X",
    options: ["X", "O", "Z", "Y"],
    explanation: "Simple alternating pattern: X, O, X, O, X."
  },
  {
    id: "true-false-pattern",
    category: "Logic Sequences",
    difficulty: 1,
    type: "text",
    sequence: ["T", "F", "T", "F"],
    answer: "T",
    options: ["T", "F", "N", "Y"],
    explanation: "Alternating True/False: T, F, T, F, T."
  },
  {
    id: "on-off-switch",
    category: "Logic Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["💡", "🌑", "💡", "🌑"],
    answer: "💡",
    options: ["💡", "🌑", "⭐", "🔦"],
    explanation: "Alternating on/off: light, dark, light, dark, light."
  },
  {
    id: "dna-bases",
    category: "Logic Sequences",
    difficulty: 3,
    type: "text",
    sequence: ["A-T", "T-A", "G-C", "C-G"],
    answer: "A-T",
    options: ["A-T", "G-T", "C-A", "T-G"],
    explanation: "DNA base pair sequence repeats: A-T, T-A, G-C, C-G, A-T."
  },
  {
    id: "coin-flip-pattern",
    category: "Logic Sequences",
    difficulty: 2,
    type: "text",
    sequence: ["H", "H", "T", "H", "H"],
    answer: "T",
    options: ["H", "T", "HH", "TT"],
    explanation: "Pattern repeats: two heads then one tail. H, H, T, H, H, T."
  },
  {
    id: "growing-repeat",
    category: "Logic Sequences",
    difficulty: 3,
    type: "emoji",
    sequence: ["⭐", "⭐⭐", "⭐⭐⭐"],
    answer: "⭐⭐⭐⭐",
    options: ["⭐⭐", "⭐⭐⭐⭐", "⭐", "⭐⭐⭐⭐⭐"],
    explanation: "Stars increase by one each step: 1, 2, 3, 4."
  },
  {
    id: "if-then-pattern",
    category: "Logic Sequences",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔵→🔴", "🔴→🟢", "🟢→🔵"],
    answer: "🔵→🔴",
    options: ["🔵→🔴", "🔴→🔵", "🟢→🔴", "🔵→🟢"],
    explanation: "Cyclic mapping: blue→red, red→green, green→blue, then repeats: blue→red."
  },
  {
    id: "chess-moves",
    category: "Logic Sequences",
    difficulty: 2,
    type: "text",
    sequence: ["e4", "e5", "Nf3", "Nc6"],
    answer: "Bb5",
    options: ["Bb5", "d4", "Bc4", "Nf6"],
    explanation: "Opening moves of the Ruy Lopez in chess: 1.e4 e5 2.Nf3 Nc6 3.Bb5."
  },
  {
    id: "morse-code-sos",
    category: "Logic Sequences",
    difficulty: 3,
    type: "text",
    sequence: ["···", "---", "···"],
    answer: "---",
    options: ["···", "---", "-·-", "·-·"],
    explanation: "SOS in Morse code repeats: ··· (S) --- (O) ··· (S) --- (O)."
  },
  {
    id: "even-odd-pattern",
    category: "Logic Sequences",
    difficulty: 1,
    type: "text",
    sequence: ["even", "odd", "even", "odd"],
    answer: "even",
    options: ["even", "odd", "prime", "zero"],
    explanation: "Alternating even and odd: even, odd, even, odd, even."
  },
  {
    id: "nesting-brackets",
    category: "Logic Sequences",
    difficulty: 3,
    type: "text",
    sequence: ["()", "(())", "((()))"],
    answer: "(((())))",
    options: ["(((())))", "((()))", "(()())", "(())()"],
    explanation: "Each step adds another level of nesting: (), (()), ((())), (((())))."
  },
  {
    id: "countdown-launch",
    category: "Logic Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["5️⃣", "4️⃣", "3️⃣", "2️⃣", "1️⃣"],
    answer: "🚀",
    options: ["0️⃣", "🚀", "💥", "🎆"],
    explanation: "Rocket countdown: 5, 4, 3, 2, 1, launch! 🚀"
  },

  // ─── Visual & Spatial (new category) ───────────────────
  {
    id: "arrow-rotation-cw",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "emoji",
    sequence: ["⬆️", "➡️", "⬇️"],
    answer: "⬅️",
    options: ["⬅️", "↗️", "⬆️", "↘️"],
    explanation: "Arrow rotates 90° clockwise: up → right → down → left."
  },
  {
    id: "arrow-rotation-ccw",
    category: "Visual & Spatial",
    difficulty: 2,
    type: "emoji",
    sequence: ["⬆️", "⬅️", "⬇️"],
    answer: "➡️",
    options: ["➡️", "⬆️", "↗️", "↙️"],
    explanation: "Arrow rotates 90° counter-clockwise: up → left → down → right."
  },
  {
    id: "diagonal-arrows",
    category: "Visual & Spatial",
    difficulty: 2,
    type: "emoji",
    sequence: ["↗️", "↘️", "↙️"],
    answer: "↖️",
    options: ["↖️", "↗️", "➡️", "⬆️"],
    explanation: "Diagonal arrows rotating clockwise: NE → SE → SW → NW."
  },
  {
    id: "growing-circles",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "emoji",
    sequence: ["·", "●", "⬤"],
    answer: "🔵",
    options: ["🔵", "·", "○", "⚪"],
    explanation: "Circles growing in size: tiny dot → medium circle → large filled circle → big blue circle."
  },
  {
    id: "moon-waning",
    category: "Visual & Spatial",
    difficulty: 2,
    type: "emoji",
    sequence: ["🌕", "🌖", "🌗", "🌘"],
    answer: "🌑",
    options: ["🌑", "🌒", "🌕", "🌙"],
    explanation: "Waning moon phases: full → waning gibbous → last quarter → waning crescent → new moon."
  },
  {
    id: "clock-face-quarters",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "emoji",
    sequence: ["🕛", "🕐", "🕑", "🕒"],
    answer: "🕓",
    options: ["🕓", "🕔", "🕛", "🕕"],
    explanation: "Clock advancing one hour: 12 → 1 → 2 → 3 → 4."
  },
  {
    id: "pointing-hands-cw",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "emoji",
    sequence: ["👆", "👉", "👇"],
    answer: "👈",
    options: ["👈", "👆", "✋", "🤚"],
    explanation: "Pointing hand rotates clockwise: up → right → down → left."
  },
  {
    id: "shape-sides-text",
    category: "Visual & Spatial",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔺", "⬜", "⬠"],
    answer: "⬡",
    options: ["⬡", "⭕", "🔷", "🔺"],
    explanation: "Shapes with increasing sides: triangle (3) → square (4) → pentagon (5) → hexagon (6)."
  },
  {
    id: "size-progression-emoji",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "emoji",
    sequence: ["🐜", "🐁", "🐈", "🐕"],
    answer: "🐎",
    options: ["🐎", "🐁", "🐘", "🐿️"],
    explanation: "Animals getting progressively larger: ant → mouse → cat → dog → horse."
  },
  {
    id: "zoom-in-world",
    category: "Visual & Spatial",
    difficulty: 2,
    type: "emoji",
    sequence: ["🌍", "🏔️", "🏘️", "🏠"],
    answer: "🚪",
    options: ["🚪", "🪟", "🌍", "🏢"],
    explanation: "Zooming in: Earth → mountain → neighborhood → house → door."
  },
  {
    id: "stacking-blocks",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "text",
    sequence: ["□", "□□", "□□□"],
    answer: "□□□□",
    options: ["□□□□", "□□", "□□□□□", "□"],
    explanation: "Adding one block each step: 1, 2, 3, 4 blocks."
  },
  {
    id: "color-wheel-primary",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴", "🟡", "🔵"],
    answer: "🔴",
    options: ["🔴", "🟢", "🟠", "🟣"],
    explanation: "Primary colors cycle: red, yellow, blue, then back to red."
  },
  {
    id: "symmetry-pattern",
    category: "Visual & Spatial",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔴", "🔵", "🟢", "🔵"],
    answer: "🔴",
    options: ["🔴", "🟢", "🔵", "🟡"],
    explanation: "Mirror symmetry: 🔴 🔵 🟢 🔵 🔴 — the pattern reflects back."
  },
  {
    id: "compass-directions",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "text",
    sequence: ["N", "E", "S"],
    answer: "W",
    options: ["W", "NE", "NW", "SE"],
    explanation: "Cardinal compass directions clockwise: North, East, South, West."
  },

  // ─── Creative & Mixed (new category) ───────────────────
  {
    id: "emoji-math-add",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["1️⃣➕1️⃣", "2️⃣➕2️⃣", "3️⃣➕3️⃣"],
    answer: "4️⃣➕4️⃣",
    options: ["4️⃣➕4️⃣", "3️⃣➕4️⃣", "5️⃣➕5️⃣", "4️⃣➕3️⃣"],
    explanation: "Matching addition: 1+1, 2+2, 3+3, 4+4."
  },
  {
    id: "age-progression",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["👶", "🧒", "🧑", "🧓"],
    answer: "👴",
    options: ["👴", "🧒", "👶", "🧑"],
    explanation: "Human aging: baby → child → adult → middle-aged → elderly."
  },
  {
    id: "emotion-cycle",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["😊", "😐", "😢", "😡"],
    answer: "😊",
    options: ["😊", "😱", "😴", "🤢"],
    explanation: "Emotion cycle: happy → neutral → sad → angry → back to happy."
  },
  {
    id: "tech-evolution",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["📻", "📺", "🖥️", "💻"],
    answer: "📱",
    options: ["📱", "📻", "🖨️", "⌨️"],
    explanation: "Technology evolution: radio → TV → desktop → laptop → smartphone."
  },
  {
    id: "transportation-speed",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["🚶", "🚲", "🚗", "✈️"],
    answer: "🚀",
    options: ["🚀", "🚂", "🚌", "🛵"],
    explanation: "Transportation by increasing speed: walking → bicycle → car → plane → rocket."
  },
  {
    id: "light-to-dark",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["⬜", "🟨", "🟧", "🟥"],
    answer: "🟫",
    options: ["🟫", "⬛", "🟩", "🟦"],
    explanation: "Colors getting progressively darker: white → yellow → orange → red → brown."
  },
  {
    id: "story-arc",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["📖", "⚡", "😱", "💪"],
    answer: "🎉",
    options: ["🎉", "📖", "😭", "💀"],
    explanation: "Story arc: introduction → conflict → crisis → struggle → resolution/celebration."
  },
  {
    id: "money-growth",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["🪙", "💵", "💰", "🏦"],
    answer: "🏛️",
    options: ["🏛️", "🪙", "💸", "💳"],
    explanation: "Money growing: coin → bill → bag of money → bank → central bank/treasury."
  },
  {
    id: "day-cycle",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌅", "☀️", "🌇", "🌙"],
    answer: "🌅",
    options: ["🌅", "⭐", "🌤️", "🌑"],
    explanation: "Daily cycle: sunrise → midday → sunset → night → sunrise again."
  },
  {
    id: "build-snowman",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["❄️", "⛄", "🎩", "🥕"],
    answer: "🧣",
    options: ["🧣", "👀", "🧤", "❄️"],
    explanation: "Building a snowman: snow falls → roll body → add hat → add carrot nose → add scarf."
  },
  {
    id: "communication-evolution",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["🗣️", "✉️", "☎️", "📧"],
    answer: "💬",
    options: ["💬", "📮", "📞", "🗣️"],
    explanation: "Communication evolution: speech → letter → telephone → email → instant messaging."
  },
  {
    id: "battery-charge",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["🪫", "🔋", "🔋🔋"],
    answer: "🔋🔋🔋",
    options: ["🔋🔋🔋", "🪫", "🔋", "⚡"],
    explanation: "Battery charging up: empty → one bar → two bars → three bars (full)."
  },
  {
    id: "writing-process",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["💡", "📝", "✍️", "📄"],
    answer: "📚",
    options: ["📚", "💡", "🗑️", "📝"],
    explanation: "Writing process: idea → notes → writing → manuscript → published book."
  },
  {
    id: "seasons-wardrobe",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["👕", "👙", "🧥"],
    answer: "🧤",
    options: ["🧤", "👗", "👕", "🩳"],
    explanation: "Seasonal clothing: t-shirt (spring) → swimsuit (summer) → coat (fall) → gloves (winter)."
  },

  // ─── Nature (expanded) ─────────────────────────────────
  {
    id: "butterfly-lifecycle",
    category: "Nature",
    difficulty: 2,
    type: "emoji",
    sequence: ["🥚", "🐛", "🫘"],
    answer: "🦋",
    options: ["🦋", "🐛", "🐝", "🪲"],
    explanation: "Butterfly lifecycle: egg → caterpillar → chrysalis → butterfly."
  },
  {
    id: "tree-seasons",
    category: "Nature",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌳", "🌲", "🍂", "🌨️"],
    answer: "🌸",
    options: ["🌸", "🌳", "🍁", "☀️"],
    explanation: "A tree through seasons: full leaves → evergreen → falling leaves → snow → blossoms (spring)."
  },
  {
    id: "volcanic-eruption",
    category: "Nature",
    difficulty: 2,
    type: "emoji",
    sequence: ["🏔️", "💨", "🌋", "🔥"],
    answer: "🪨",
    options: ["🪨", "🌊", "🌋", "💨"],
    explanation: "Volcanic cycle: dormant mountain → smoke → eruption → fire → solidified lava rock."
  },
  {
    id: "seed-to-fruit",
    category: "Nature",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌰", "🌱", "🌿", "🌸"],
    answer: "🍎",
    options: ["🍎", "🌰", "🌳", "🍂"],
    explanation: "Plant to fruit: seed → sprout → leaves → flower → fruit."
  },
  {
    id: "tide-cycle",
    category: "Nature",
    difficulty: 2,
    type: "emoji",
    sequence: ["🌊", "🏖️", "🌊🌊", "🏖️🏖️"],
    answer: "🌊🌊🌊",
    options: ["🌊🌊🌊", "🏖️", "🌊", "🏖️🏖️🏖️"],
    explanation: "Tides rising: wave → beach → bigger waves → more beach exposed → highest tide."
  },
  {
    id: "cloud-types",
    category: "Nature",
    difficulty: 3,
    type: "emoji",
    sequence: ["☁️", "🌥️", "⛅", "🌤️"],
    answer: "☀️",
    options: ["☀️", "🌧️", "☁️", "⛈️"],
    explanation: "Clouds clearing: overcast → mostly cloudy → partly cloudy → mostly sunny → clear sky."
  },

  // ─── Science (expanded) ────────────────────────────────
  {
    id: "states-of-matter",
    category: "Science",
    difficulty: 1,
    type: "emoji",
    sequence: ["🧊", "💧", "♨️"],
    answer: "☁️",
    options: ["☁️", "🧊", "💧", "🔥"],
    explanation: "States of matter with rising temperature: solid (ice) → liquid (water) → gas (steam) → vapor (cloud)."
  },
  {
    id: "rainbow-colors-full",
    category: "Science",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴", "🟠", "🟡", "🟢", "🔵"],
    answer: "🟣",
    options: ["🟣", "⚪", "🔴", "⬛"],
    explanation: "Rainbow colors (ROYGBV): red, orange, yellow, green, blue, violet/purple."
  },
  {
    id: "electromagnetic-spectrum",
    category: "Science",
    difficulty: 3,
    type: "text",
    sequence: ["Radio", "Micro", "IR", "Visible"],
    answer: "UV",
    options: ["UV", "X-ray", "Gamma", "Radio"],
    explanation: "Electromagnetic spectrum by frequency: Radio → Microwave → Infrared → Visible → Ultraviolet."
  },
  {
    id: "cell-division",
    category: "Science",
    difficulty: 2,
    type: "emoji",
    sequence: ["🟢", "🟢🟢", "🟢🟢🟢🟢"],
    answer: "🟢🟢🟢🟢🟢🟢🟢🟢",
    options: ["🟢🟢🟢🟢🟢🟢🟢🟢", "🟢🟢🟢🟢🟢🟢", "🟢🟢🟢", "🟢🟢🟢🟢🟢"],
    explanation: "Cell division (mitosis) doubles each time: 1, 2, 4, 8 cells."
  },
  {
    id: "ph-scale-journey",
    category: "Science",
    difficulty: 3,
    type: "text",
    sequence: ["Acid", "Weak acid", "Neutral"],
    answer: "Weak base",
    options: ["Weak base", "Strong base", "Acid", "Neutral"],
    explanation: "Moving along the pH scale: strong acid → weak acid → neutral → weak base."
  },
  {
    id: "solar-system-sizes",
    category: "Science",
    difficulty: 2,
    type: "emoji",
    sequence: ["·", "○", "🌎", "⭕"],
    answer: "🪐",
    options: ["🪐", "·", "⭐", "🌎"],
    explanation: "Planet sizes growing: Mercury (tiny) → Mars → Earth → Neptune → Saturn (giant with rings)."
  },
  {
    id: "periodic-noble-gases",
    category: "Science",
    difficulty: 3,
    type: "text",
    sequence: ["He", "Ne", "Ar", "Kr"],
    answer: "Xe",
    options: ["Xe", "Rn", "Br", "Se"],
    explanation: "Noble gases in order: Helium, Neon, Argon, Krypton, Xenon."
  },

  // ─── General Knowledge (expanded) ──────────────────────
  {
    id: "olympic-medal-order",
    category: "General Knowledge",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥇", "🥈", "🥉"],
    answer: "4️⃣",
    options: ["4️⃣", "🏆", "🥇", "5️⃣"],
    explanation: "Medal positions: gold (1st), silver (2nd), bronze (3rd), then 4th (no medal)."
  },
  {
    id: "playing-card-royals",
    category: "General Knowledge",
    difficulty: 2,
    type: "text",
    sequence: ["10", "J", "Q", "K"],
    answer: "A",
    options: ["A", "2", "Joker", "10"],
    explanation: "Playing card values ascending: 10, Jack, Queen, King, Ace."
  },
  {
    id: "century-progression",
    category: "General Knowledge",
    difficulty: 2,
    type: "text",
    sequence: ["1800s", "1900s", "2000s"],
    answer: "2100s",
    options: ["2100s", "2050s", "1700s", "2200s"],
    explanation: "Centuries progressing: 1800s, 1900s, 2000s, 2100s."
  },
  {
    id: "education-levels",
    category: "General Knowledge",
    difficulty: 1,
    type: "emoji",
    sequence: ["🏫", "🎒", "🎓", "👩‍💼"],
    answer: "👩‍🏫",
    options: ["👩‍🏫", "🏫", "📚", "🎒"],
    explanation: "Education journey: school → student → graduate → professional → teacher (giving back)."
  },
  {
    id: "chess-piece-value",
    category: "General Knowledge",
    difficulty: 3,
    type: "text",
    sequence: ["Pawn", "Knight", "Bishop", "Rook"],
    answer: "Queen",
    options: ["Queen", "King", "Pawn", "Knight"],
    explanation: "Chess pieces by value: Pawn (1) → Knight (3) → Bishop (3) → Rook (5) → Queen (9)."
  },
  {
    id: "pencil-to-publish",
    category: "General Knowledge",
    difficulty: 2,
    type: "emoji",
    sequence: ["✏️", "📝", "📑", "📰"],
    answer: "📚",
    options: ["📚", "✏️", "🗞️", "📝"],
    explanation: "From writing to publishing: pencil → notes → pages → newspaper → book."
  },

  // ─── Emoji Sequences (expanded) ────────────────────────
  {
    id: "heart-colors",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["❤️", "🧡", "💛", "💚"],
    answer: "💙",
    options: ["💙", "💜", "🖤", "❤️"],
    explanation: "Heart colors follow the rainbow: red, orange, yellow, green, blue."
  },
  {
    id: "hand-count",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["☝️", "✌️", "🤟"],
    answer: "🖖",
    options: ["🖖", "✋", "👆", "✌️"],
    explanation: "Hand signals counting up: one finger, two fingers (peace), three (love), four (Vulcan salute)."
  },
  {
    id: "moon-to-sun",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌑", "🌓", "🌕", "🌗"],
    answer: "🌑",
    options: ["🌑", "🌕", "☀️", "⭐"],
    explanation: "Full moon cycle: new → first quarter → full → last quarter → new moon again."
  },
  {
    id: "zodiac-fire-signs",
    category: "Emoji Sequences",
    difficulty: 3,
    type: "emoji",
    sequence: ["♈", "♌", "♐"],
    answer: "♈",
    options: ["♈", "♉", "♊", "♏"],
    explanation: "Fire signs of the zodiac cycle: Aries ♈, Leo ♌, Sagittarius ♐, then back to Aries."
  },
  {
    id: "fruit-to-juice",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🍊", "🔪", "🍊🍊", "🧃"],
    answer: "😋",
    options: ["😋", "🍊", "🧃", "🥤"],
    explanation: "Making juice: orange → cut → more oranges → juice → enjoy!"
  },
  {
    id: "weather-symbols",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["☀️", "🌤️", "⛅", "🌥️"],
    answer: "☁️",
    options: ["☁️", "🌧️", "☀️", "⛈️"],
    explanation: "Increasing cloudiness: sunny → mostly sunny → partly cloudy → mostly cloudy → overcast."
  },

  // ─── Music (expanded) ──────────────────────────────────
  {
    id: "volume-up",
    category: "Music",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔇", "🔈", "🔉"],
    answer: "🔊",
    options: ["🔊", "🔇", "🔈", "📢"],
    explanation: "Volume increasing: mute → low → medium → loud."
  },
  {
    id: "music-tempo",
    category: "Music",
    difficulty: 3,
    type: "text",
    sequence: ["Largo", "Adagio", "Andante", "Allegro"],
    answer: "Presto",
    options: ["Presto", "Piano", "Forte", "Largo"],
    explanation: "Musical tempos from slow to fast: Largo, Adagio, Andante, Allegro, Presto."
  },
  {
    id: "note-values",
    category: "Music",
    difficulty: 2,
    type: "text",
    sequence: ["whole", "half", "quarter", "eighth"],
    answer: "sixteenth",
    options: ["sixteenth", "third", "double", "thirty-second"],
    explanation: "Musical note durations halving: whole, half, quarter, eighth, sixteenth."
  },
  {
    id: "scale-solfege",
    category: "Music",
    difficulty: 2,
    type: "text",
    sequence: ["Do", "Re", "Mi", "Fa"],
    answer: "Sol",
    options: ["Sol", "La", "Ti", "Do"],
    explanation: "Solfège scale: Do, Re, Mi, Fa, Sol."
  },

  // ─── Flags (expanded) ──────────────────────────────────
  {
    id: "flag-primary-colors",
    category: "Flags",
    difficulty: 1,
    type: "emoji",
    sequence: ["🇫🇷", "🇮🇹", "🇩🇪"],
    answer: "🇧🇪",
    options: ["🇧🇪", "🇪🇸", "🇬🇧", "🇯🇵"],
    explanation: "European tricolor flags in sequence: France, Italy, Germany, Belgium."
  },
  {
    id: "nordic-crosses",
    category: "Flags",
    difficulty: 2,
    type: "emoji",
    sequence: ["🇩🇰", "🇳🇴", "🇸🇪"],
    answer: "🇫🇮",
    options: ["🇫🇮", "🇩🇪", "🇬🇧", "🇫🇷"],
    explanation: "Nordic cross flags: Denmark, Norway, Sweden, Finland."
  },
  {
    id: "flag-continents",
    category: "Flags",
    difficulty: 2,
    type: "emoji",
    sequence: ["🇺🇸", "🇧🇷", "🇬🇧", "🇨🇳"],
    answer: "🇦🇺",
    options: ["🇦🇺", "🇯🇵", "🇮🇳", "🇲🇽"],
    explanation: "One flag per continent: N. America (US), S. America (Brazil), Europe (UK), Asia (China), Oceania (Australia)."
  },
  {
    id: "g7-nations",
    category: "Flags",
    difficulty: 3,
    type: "emoji",
    sequence: ["🇺🇸", "🇬🇧", "🇫🇷", "🇩🇪"],
    answer: "🇯🇵",
    options: ["🇯🇵", "🇨🇳", "🇧🇷", "🇦🇺"],
    explanation: "G7 nations: USA, UK, France, Germany, Japan (continuing with Italy and Canada)."
  },

  // ─── Sports (expanded) ─────────────────────────────────
  {
    id: "olympic-podium",
    category: "Sports",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥇", "🥈", "🥉"],
    answer: "👏",
    options: ["👏", "🏆", "🥇", "4️⃣"],
    explanation: "Olympic awards end with celebration: gold, silver, bronze, then applause."
  },
  {
    id: "marathon-splits",
    category: "Sports",
    difficulty: 2,
    type: "emoji",
    sequence: ["🏃", "🏃💨", "🏃💨💨", "🏃💨💨💨"],
    answer: "🏁",
    options: ["🏁", "🏃", "🚶", "💀"],
    explanation: "Marathon runner accelerating to finish: running → faster → fastest → sprint → finish line!"
  },
  {
    id: "swim-dive-sequence",
    category: "Sports",
    difficulty: 1,
    type: "emoji",
    sequence: ["🧍", "🤸", "🏊"],
    answer: "🏅",
    options: ["🏅", "🧍", "🤿", "🦈"],
    explanation: "Diving competition: stand → flip → swim/splash → medal."
  },
  {
    id: "basketball-play",
    category: "Sports",
    difficulty: 1,
    type: "emoji",
    sequence: ["🏀", "⛹️", "🏀💨"],
    answer: "🏆",
    options: ["🏆", "🏀", "⛹️", "🥅"],
    explanation: "Basketball play: ball → dribble → shoot → score/trophy."
  },
  {
    id: "boxing-rounds",
    category: "Sports",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔔", "🥊", "🥊🥊", "🔔"],
    answer: "🥊",
    options: ["🥊", "🔔", "🏆", "💤"],
    explanation: "Boxing match: bell rings → fight → more fighting → bell → next round begins."
  },
  {
    id: "tennis-scoring",
    category: "Sports",
    difficulty: 2,
    type: "text",
    sequence: ["0", "15", "30"],
    answer: "40",
    options: ["40", "45", "35", "50"],
    explanation: "Tennis scoring: love (0), 15, 30, 40."
  },

  // ─── Food (expanded) ───────────────────────────────────
  {
    id: "coffee-making",
    category: "Food",
    difficulty: 1,
    type: "emoji",
    sequence: ["🫘", "⚙️", "☕"],
    answer: "😊",
    options: ["😊", "🫘", "🍵", "☕"],
    explanation: "Making coffee: beans → grind → brew → enjoy!"
  },
  {
    id: "egg-cooking",
    category: "Food",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥚", "🍳", "🧈"],
    answer: "🍽️",
    options: ["🍽️", "🥚", "🧂", "🍳"],
    explanation: "Cooking an egg: raw egg → fry in pan → add butter → serve on plate."
  },
  {
    id: "spice-heat-levels",
    category: "Food",
    difficulty: 2,
    type: "emoji",
    sequence: ["🫑", "🌶️", "🌶️🌶️"],
    answer: "🌶️🌶️🌶️",
    options: ["🌶️🌶️🌶️", "🫑", "🌶️", "🔥"],
    explanation: "Increasing spice level: bell pepper (mild) → one chili → two chilies → three chilies (hot!)."
  },
  {
    id: "grape-to-wine",
    category: "Food",
    difficulty: 2,
    type: "emoji",
    sequence: ["🍇", "🧺", "🫧"],
    answer: "🍷",
    options: ["🍷", "🍇", "🧃", "🥤"],
    explanation: "Winemaking: grapes → harvest → fermentation → wine."
  },
  {
    id: "bread-making",
    category: "Food",
    difficulty: 2,
    type: "emoji",
    sequence: ["🌾", "🫗", "🫓"],
    answer: "🍞",
    options: ["🍞", "🌾", "🧁", "🥖"],
    explanation: "Bread making: wheat → flour/mix → dough → baked bread."
  },

  // ─── Animals (expanded) ────────────────────────────────
  {
    id: "frog-lifecycle",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🥚", "〰️", "🐸"],
    answer: "🐸",
    options: ["🐸", "🥚", "🐊", "🦎"],
    explanation: "Frog lifecycle: egg → tadpole (squiggle) → froglet → adult frog."
  },
  {
    id: "dog-aging",
    category: "Animals",
    difficulty: 1,
    type: "emoji",
    sequence: ["🐕‍🦺", "🐕", "🦮"],
    answer: "🐾",
    options: ["🐾", "🐕", "🐶", "🦴"],
    explanation: "A dog's life: puppy → adult dog → old faithful companion → paw prints (legacy)."
  },
  {
    id: "bird-migration",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🌸🐦", "☀️🐦", "🍂🐦"],
    answer: "✈️🐦",
    options: ["✈️🐦", "❄️🐦", "🌸🐦", "🐣"],
    explanation: "Bird yearly cycle: spring nest → summer stay → autumn prepare → fly south (migrate)."
  },
  {
    id: "marine-food-chain",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🦠", "🐟", "🦈"],
    answer: "🐋",
    options: ["🐋", "🦠", "🐠", "🐙"],
    explanation: "Marine size chain: plankton → small fish → shark → whale."
  },
  {
    id: "insect-metamorphosis",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🥚", "🪱", "🫘"],
    answer: "🪰",
    options: ["🪰", "🐛", "🦗", "🐝"],
    explanation: "Fly metamorphosis: egg → larva (worm) → pupa → adult fly."
  },

  // ─── Pop Culture (expanded) ────────────────────────────
  {
    id: "movie-marathon",
    category: "Pop Culture",
    difficulty: 1,
    type: "emoji",
    sequence: ["🍿", "🎬", "😂", "😢"],
    answer: "😴",
    options: ["😴", "🍿", "🎬", "😱"],
    explanation: "Movie marathon night: popcorn → start movie → laugh → cry → fall asleep."
  },
  {
    id: "selfie-post",
    category: "Pop Culture",
    difficulty: 1,
    type: "emoji",
    sequence: ["📸", "✨", "📤"],
    answer: "❤️",
    options: ["❤️", "📸", "👎", "📤"],
    explanation: "Social media flow: take photo → edit/filter → post → get likes/hearts."
  },
  {
    id: "concert-experience",
    category: "Pop Culture",
    difficulty: 2,
    type: "emoji",
    sequence: ["🎫", "🚗", "🎤", "🎶"],
    answer: "🤳",
    options: ["🤳", "🎫", "🏠", "🎤"],
    explanation: "Concert experience: ticket → drive → performer sings → music plays → take a selfie."
  },
  {
    id: "streaming-binge",
    category: "Pop Culture",
    difficulty: 1,
    type: "emoji",
    sequence: ["📺", "▶️", "⏩", "⏩⏩"],
    answer: "🔄",
    options: ["🔄", "⏹️", "▶️", "⏪"],
    explanation: "Binge-watching: TV on → play → skip intro → speed through → rewatch the whole thing."
  },

  // ─── Colors & Patterns (expanded) ──────────────────────
  {
    id: "color-mixing-rg",
    category: "Colors & Patterns",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔴", "➕", "🟡"],
    answer: "🟠",
    options: ["🟠", "🟢", "🟣", "🔵"],
    explanation: "Color mixing: red + yellow = orange."
  },
  {
    id: "color-mixing-rb",
    category: "Colors & Patterns",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔴", "➕", "🔵"],
    answer: "🟣",
    options: ["🟣", "🟢", "🟠", "🟤"],
    explanation: "Color mixing: red + blue = purple."
  },
  {
    id: "color-mixing-yb",
    category: "Colors & Patterns",
    difficulty: 2,
    type: "emoji",
    sequence: ["🟡", "➕", "🔵"],
    answer: "🟢",
    options: ["🟢", "🟣", "🟠", "🟤"],
    explanation: "Color mixing: yellow + blue = green."
  },
  {
    id: "rgb-repeat",
    category: "Colors & Patterns",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴", "🟢", "🔵", "🔴", "🟢"],
    answer: "🔵",
    options: ["🔵", "🔴", "🟢", "🟡"],
    explanation: "Repeating RGB pattern: red, green, blue, red, green, blue."
  },
  {
    id: "warm-colors-gradient",
    category: "Colors & Patterns",
    difficulty: 1,
    type: "emoji",
    sequence: ["🟡", "🟠", "🔴"],
    answer: "🟤",
    options: ["🟤", "🟡", "⬛", "🟣"],
    explanation: "Warm colors darkening: yellow → orange → red → brown."
  },
  {
    id: "cool-colors-gradient",
    category: "Colors & Patterns",
    difficulty: 1,
    type: "emoji",
    sequence: ["🟢", "🔵", "🟣"],
    answer: "⬛",
    options: ["⬛", "🟢", "⬜", "🔵"],
    explanation: "Cool colors darkening: green → blue → purple → black."
  },
  {
    id: "shape-color-pattern",
    category: "Colors & Patterns",
    difficulty: 2,
    type: "image",
    sequence: ["img/colors/red.svg", "img/shapes/triangle.svg", "img/colors/blue.svg", "img/shapes/square.svg"],
    answer: "img/colors/green.svg",
    options: ["img/colors/green.svg", "img/shapes/pentagon.svg", "img/colors/yellow.svg", "img/shapes/circle.svg"],
    explanation: "Alternating pattern: color, shape, color, shape, color."
  },
  {
    id: "shapes-reverse",
    category: "Colors & Patterns",
    difficulty: 2,
    type: "image",
    sequence: ["img/shapes/hexagon.svg", "img/shapes/pentagon.svg", "img/shapes/square.svg"],
    answer: "img/shapes/triangle.svg",
    options: ["img/shapes/triangle.svg", "img/shapes/circle.svg", "img/shapes/star.svg", "img/shapes/hexagon.svg"],
    explanation: "Shapes losing one side: hexagon (6) → pentagon (5) → square (4) → triangle (3)."
  },

  // ─── Additional Math & Numbers ─────────────────────────
  {
    id: "pentagonal-numbers",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["1", "5", "12", "22"],
    answer: "35",
    options: ["30", "35", "40", "28"],
    explanation: "Pentagonal numbers: 1, 5, 12, 22, 35. Differences increase by 3 each time."
  },
  {
    id: "sum-of-digits",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["10", "11", "12", "13"],
    answer: "14",
    options: ["14", "15", "20", "9"],
    explanation: "Simple counting: 10, 11, 12, 13, 14."
  },
  {
    id: "multiples-of-six",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["6", "12", "18", "24"],
    answer: "30",
    options: ["28", "30", "32", "36"],
    explanation: "Multiples of 6: 6, 12, 18, 24, 30."
  },
  {
    id: "multiples-of-nine",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["9", "18", "27", "36"],
    answer: "45",
    options: ["42", "44", "45", "48"],
    explanation: "Multiples of 9: 9, 18, 27, 36, 45."
  },
  {
    id: "catalan-numbers",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["1", "1", "2", "5"],
    answer: "14",
    options: ["10", "12", "14", "16"],
    explanation: "Catalan numbers: 1, 1, 2, 5, 14. Used in combinatorics for counting paths."
  },

  // ─── Additional Logic Sequences ────────────────────────
  {
    id: "fizzbuzz-start",
    category: "Logic Sequences",
    difficulty: 3,
    type: "text",
    sequence: ["1", "2", "Fizz", "4", "Buzz"],
    answer: "Fizz",
    options: ["6", "Fizz", "Buzz", "FizzBuzz"],
    explanation: "FizzBuzz: replace multiples of 3 with Fizz, 5 with Buzz. 6 is divisible by 3 → Fizz."
  },
  {
    id: "collatz-start-6",
    category: "Logic Sequences",
    difficulty: 3,
    type: "text",
    sequence: ["6", "3", "10", "5"],
    answer: "16",
    options: ["12", "15", "16", "8"],
    explanation: "Collatz sequence from 6: if even ÷2, if odd ×3+1. 5 is odd → 5×3+1 = 16."
  },
  {
    id: "look-and-say",
    category: "Logic Sequences",
    difficulty: 3,
    type: "text",
    sequence: ["1", "11", "21", "1211"],
    answer: "111221",
    options: ["111221", "12211", "112211", "1221"],
    explanation: "Look-and-say: describe the previous term. 1211 has 'one 1, one 2, two 1s' = 111221."
  },
  {
    id: "happy-sad-pattern",
    category: "Logic Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["😊", "😊", "😢", "😊", "😊"],
    answer: "😢",
    options: ["😊", "😢", "😐", "😡"],
    explanation: "Pattern: two happy, one sad, repeat. 😊😊😢 → 😊😊😢."
  },
  {
    id: "staircase-pattern",
    category: "Logic Sequences",
    difficulty: 2,
    type: "text",
    sequence: ["1", "1 2", "1 2 3", "1 2 3 4"],
    answer: "1 2 3 4 5",
    options: ["1 2 3 4 5", "5", "1 2 3 4", "5 4 3 2 1"],
    explanation: "Each step adds the next number: 1 | 1 2 | 1 2 3 | 1 2 3 4 | 1 2 3 4 5."
  },

  // ─── Additional Visual & Spatial ───────────────────────
  {
    id: "clock-counter-clockwise",
    category: "Visual & Spatial",
    difficulty: 2,
    type: "emoji",
    sequence: ["🕛", "🕘", "🕕"],
    answer: "🕒",
    options: ["🕒", "🕐", "🕓", "🕗"],
    explanation: "Clock going backwards by 3 hours: 12 → 9 → 6 → 3."
  },
  {
    id: "zoom-out-world",
    category: "Visual & Spatial",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔬", "🧫", "🦠", "🐛"],
    answer: "🐈",
    options: ["🐈", "🐘", "🔬", "🏠"],
    explanation: "Zooming out from microscopic: microscope → petri dish → microbe → insect → cat (visible world)."
  },

  // ─── Additional General Knowledge ──────────────────────
  {
    id: "rainbow-promise",
    category: "General Knowledge",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌧️", "☀️", "🌈"],
    answer: "😊",
    options: ["😊", "🌧️", "⛈️", "🌤️"],
    explanation: "After rain comes sun, then rainbow, then happiness."
  },
  {
    id: "school-day",
    category: "General Knowledge",
    difficulty: 1,
    type: "emoji",
    sequence: ["⏰", "🏫", "📚", "🔔"],
    answer: "🏠",
    options: ["🏠", "⏰", "📝", "🏫"],
    explanation: "A school day: alarm → school → study → bell rings → go home."
  },

  // ─── Additional Nature ─────────────────────────────────
  {
    id: "river-journey",
    category: "Nature",
    difficulty: 2,
    type: "emoji",
    sequence: ["🏔️", "🏞️", "🌊"],
    answer: "🐟",
    options: ["🐟", "🏔️", "🌅", "🏜️"],
    explanation: "River journey: mountain source → valley/river → ocean → sea life."
  },
  {
    id: "storm-forming",
    category: "Nature",
    difficulty: 2,
    type: "emoji",
    sequence: ["☀️", "💨", "☁️", "⚡"],
    answer: "🌧️",
    options: ["🌧️", "☀️", "❄️", "🌈"],
    explanation: "Storm forming: heat → wind → clouds → lightning → rain."
  },

  // ─── Additional Science ────────────────────────────────
  {
    id: "lab-safety-steps",
    category: "Science",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥼", "🥽", "🧤"],
    answer: "🔬",
    options: ["🔬", "🧪", "🥼", "🩺"],
    explanation: "Lab safety: put on coat → goggles → gloves → then use the microscope."
  },
  {
    id: "rocket-stages",
    category: "Science",
    difficulty: 2,
    type: "emoji",
    sequence: ["🚀", "💨💨", "🔥", "🌍"],
    answer: "🌙",
    options: ["🌙", "🚀", "⭐", "🛸"],
    explanation: "Space mission stages: launch → boost → burn → orbit Earth → reach the Moon."
  },

  // ─── Additional Emoji Sequences ────────────────────────
  {
    id: "clapping-rhythm",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["👏", "👏", "👏👏"],
    answer: "👏",
    options: ["👏", "👏👏", "👏👏👏", "🙌"],
    explanation: "Clapping rhythm pattern: clap, clap, double-clap, clap (repeats)."
  },
  {
    id: "emoji-faces-progression",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["😀", "😃", "😄", "😁"],
    answer: "😆",
    options: ["😆", "😀", "😊", "🤣"],
    explanation: "Smiling faces getting happier: grin → big grin → squinting grin → big squinting grin → laughing."
  },

  // ─── Additional Music ──────────────────────────────────
  {
    id: "band-formation",
    category: "Music",
    difficulty: 2,
    type: "emoji",
    sequence: ["🥁", "🎸", "🎹"],
    answer: "🎤",
    options: ["🎤", "🎺", "🎻", "🥁"],
    explanation: "Forming a band: drums → guitar → keyboard → lead vocals."
  },
  {
    id: "music-evolution-media",
    category: "Music",
    difficulty: 2,
    type: "emoji",
    sequence: ["📀", "💿", "📱"],
    answer: "🎧",
    options: ["🎧", "📻", "📀", "💿"],
    explanation: "Music media evolution: vinyl record → CD → phone streaming → wireless headphones."
  },

  // ─── Additional Sports ─────────────────────────────────
  {
    id: "soccer-match-flow",
    category: "Sports",
    difficulty: 1,
    type: "emoji",
    sequence: ["⚽", "🥅", "📣"],
    answer: "🎉",
    options: ["🎉", "⚽", "🥅", "😢"],
    explanation: "Soccer goal celebration: kick ball → hits net → crowd roars → celebration."
  },
  {
    id: "cycling-race",
    category: "Sports",
    difficulty: 1,
    type: "emoji",
    sequence: ["🚴", "🚴💨", "🏔️"],
    answer: "🏁",
    options: ["🏁", "🚴", "🏆", "🛑"],
    explanation: "Cycling race: start → accelerate → climb mountain → finish line."
  },

  // ─── Additional Food ───────────────────────────────────
  {
    id: "tea-making",
    category: "Food",
    difficulty: 1,
    type: "emoji",
    sequence: ["💧", "🔥", "🫖"],
    answer: "🍵",
    options: ["🍵", "☕", "💧", "🫖"],
    explanation: "Making tea: water → heat/boil → teapot → cup of tea."
  },
  {
    id: "chocolate-making",
    category: "Food",
    difficulty: 2,
    type: "emoji",
    sequence: ["🌱", "🫘", "🔥"],
    answer: "🍫",
    options: ["🍫", "🌱", "🍩", "🎂"],
    explanation: "Chocolate making: cacao plant → cacao beans → roast → chocolate bar."
  },

  // ─── Additional Animals ────────────────────────────────
  {
    id: "chicken-lifecycle",
    category: "Animals",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥚", "🐣", "🐥"],
    answer: "🐔",
    options: ["🐔", "🥚", "🦅", "🐧"],
    explanation: "Chicken lifecycle: egg → hatching → chick → adult chicken."
  },
  {
    id: "safari-animals",
    category: "Animals",
    difficulty: 1,
    type: "emoji",
    sequence: ["🦁", "🦒", "🐘", "🦓"],
    answer: "🦛",
    options: ["🦛", "🐶", "🐱", "🦁"],
    explanation: "African safari animals: lion → giraffe → elephant → zebra → hippo."
  },

  // ─── Additional Letter & Word Patterns ─────────────────
  {
    id: "greek-alphabet-start",
    category: "Letter & Word Patterns",
    difficulty: 3,
    type: "text",
    sequence: ["Alpha", "Beta", "Gamma", "Delta"],
    answer: "Epsilon",
    options: ["Epsilon", "Zeta", "Eta", "Omega"],
    explanation: "Greek alphabet: Alpha, Beta, Gamma, Delta, Epsilon."
  },
  {
    id: "keyboard-top-row",
    category: "Letter & Word Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["Q", "W", "E", "R", "T"],
    answer: "Y",
    options: ["Y", "U", "S", "A"],
    explanation: "Top row of a QWERTY keyboard: Q, W, E, R, T, Y."
  },

  // ─── Additional Creative & Mixed ───────────────────────
  {
    id: "morning-routine",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["⏰", "🚿", "👔", "☕"],
    answer: "🚗",
    options: ["🚗", "⏰", "😴", "🍳"],
    explanation: "Morning routine: alarm → shower → dress → coffee → drive to work."
  },
  {
    id: "campfire-night",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["🪵", "🔥", "🌭", "⭐"],
    answer: "😴",
    options: ["😴", "🪵", "🎸", "🏕️"],
    explanation: "Campfire night: gather wood → light fire → roast marshmallows/hotdogs → stargaze → sleep."
  },
  {
    id: "movie-making",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["📝", "🎬", "🎥", "✂️"],
    answer: "🎞️",
    options: ["🎞️", "📝", "🎬", "🍿"],
    explanation: "Movie making: write script → action/clapboard → film → edit → final reel."
  },
  {
    id: "garden-party",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌱", "🌷", "🌻"],
    answer: "🎉",
    options: ["🎉", "🌱", "🍂", "🌵"],
    explanation: "Garden party: plant → tulip blooms → sunflower grows tall → garden party celebration!"
  },
  {
    id: "cooking-contest",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["🧑‍🍳", "🔪", "🍲", "👨‍⚖️"],
    answer: "🏆",
    options: ["🏆", "🧑‍🍳", "💀", "🍲"],
    explanation: "Cooking contest: chef → prep/chop → cook dish → judges taste → trophy!"
  },

  // ─── More Math & Numbers (reaching 200+) ───────────────
  {
    id: "negative-descending",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["3", "1", "-1", "-3"],
    answer: "-5",
    options: ["-4", "-5", "-6", "-2"],
    explanation: "Subtract 2 each time: 3, 1, -1, -3, -5."
  },
  {
    id: "powers-of-ten",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["1", "10", "100", "1000"],
    answer: "10000",
    options: ["5000", "10000", "2000", "1100"],
    explanation: "Powers of 10: multiply by 10 each time. 1, 10, 100, 1,000, 10,000."
  },
  {
    id: "sum-of-consecutive",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["1", "3", "6", "10", "15"],
    answer: "21",
    options: ["18", "20", "21", "25"],
    explanation: "Sum of 1+2+3+...+n: 1, 3, 6, 10, 15, 21 (adding 6 to 15)."
  },

  // ─── More Logic Sequences ──────────────────────────────
  {
    id: "abab-pattern",
    category: "Logic Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🍎", "🍌", "🍎", "🍌"],
    answer: "🍎",
    options: ["🍎", "🍌", "🍇", "🍊"],
    explanation: "Simple ABAB pattern: apple, banana, apple, banana, apple."
  },
  {
    id: "abc-repeat",
    category: "Logic Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴", "🔵", "🟢", "🔴", "🔵"],
    answer: "🟢",
    options: ["🟢", "🔴", "🔵", "🟡"],
    explanation: "ABC repeating pattern: red, blue, green, red, blue, green."
  },
  {
    id: "aabb-pattern",
    category: "Logic Sequences",
    difficulty: 2,
    type: "emoji",
    sequence: ["⭐", "⭐", "🌙", "🌙", "⭐"],
    answer: "⭐",
    options: ["⭐", "🌙", "☀️", "💫"],
    explanation: "AABB repeating: star, star, moon, moon, star, star."
  },

  // ─── More Visual & Spatial ─────────────────────────────
  {
    id: "emoji-size-shrink",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "emoji",
    sequence: ["🐘", "🐕", "🐈", "🐁"],
    answer: "🐜",
    options: ["🐜", "🐘", "🐕", "🦠"],
    explanation: "Animals shrinking in size: elephant → dog → cat → mouse → ant."
  },

  // ─── More Creative & Mixed ─────────────────────────────
  {
    id: "recycling-cycle",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["🛒", "📦", "🗑️", "♻️"],
    answer: "🛒",
    options: ["🛒", "🗑️", "📦", "🏭"],
    explanation: "Recycling cycle: buy → package → discard → recycle → buy again."
  },
  {
    id: "holiday-season",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["🎃", "🦃", "🎄"],
    answer: "🎆",
    options: ["🎆", "🎃", "💘", "🐣"],
    explanation: "End-of-year holidays: Halloween → Thanksgiving → Christmas → New Year's fireworks."
  },
  {
    id: "fitness-journey",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["🛋️", "🏃", "💪", "🏋️"],
    answer: "🏆",
    options: ["🏆", "🛋️", "🤕", "🏃"],
    explanation: "Fitness journey: couch → start running → get strong → weightlifting → achievement/trophy."
  },

  // ─── Additional Letter & Word Patterns ─────────────────
  {
    id: "hex-digits",
    category: "Letter & Word Patterns",
    difficulty: 3,
    type: "text",
    sequence: ["8", "9", "A", "B", "C"],
    answer: "D",
    options: ["D", "E", "10", "F"],
    explanation: "Hexadecimal counting: 8, 9, A (10), B (11), C (12), D (13)."
  },
  {
    id: "braille-numbers-concept",
    category: "Letter & Word Patterns",
    difficulty: 3,
    type: "text",
    sequence: ["1st", "2nd", "3rd", "4th"],
    answer: "5th",
    options: ["5th", "5nd", "5rd", "fifth"],
    explanation: "Ordinal numbers: 1st, 2nd, 3rd, 4th, 5th."
  },

  // ─── Additional Flags ──────────────────────────────────
  {
    id: "brics-flags",
    category: "Flags",
    difficulty: 3,
    type: "emoji",
    sequence: ["🇧🇷", "🇷🇺", "🇮🇳", "🇨🇳"],
    answer: "🇿🇦",
    options: ["🇿🇦", "🇯🇵", "🇲🇽", "🇦🇺"],
    explanation: "BRICS nations: Brazil, Russia, India, China, South Africa."
  },

  // ─── Additional Sports ─────────────────────────────────
  {
    id: "swimming-race",
    category: "Sports",
    difficulty: 1,
    type: "emoji",
    sequence: ["🏊", "🏊💨", "🏊💨💨"],
    answer: "🏅",
    options: ["🏅", "🏊", "🦈", "🌊"],
    explanation: "Swimming race: start swimming → faster → fastest → win a medal!"
  },

  // ─── Additional Food ───────────────────────────────────
  {
    id: "smoothie-making",
    category: "Food",
    difficulty: 1,
    type: "emoji",
    sequence: ["🍌", "🍓", "🥛"],
    answer: "🥤",
    options: ["🥤", "🍌", "🧃", "🍹"],
    explanation: "Making a smoothie: banana → strawberry → milk → blended smoothie."
  },

  // ─── Additional Animals ────────────────────────────────
  {
    id: "arctic-animals",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🐧", "🦭", "🐻‍❄️"],
    answer: "🐋",
    options: ["🐋", "🐧", "🦊", "🐻"],
    explanation: "Arctic/Antarctic animals by size: penguin → seal → polar bear → whale."
  },

  // ─── Additional Pop Culture ────────────────────────────
  {
    id: "phone-evolution",
    category: "Pop Culture",
    difficulty: 2,
    type: "emoji",
    sequence: ["☎️", "📞", "📟", "📱"],
    answer: "⌚",
    options: ["⌚", "☎️", "💻", "📞"],
    explanation: "Phone evolution: rotary → cordless → pager → smartphone → smartwatch."
  },

  // ─── Reaching 200+ with diverse extras ─────────────────
  {
    id: "perfect-numbers-start",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["6", "28"],
    answer: "496",
    options: ["120", "496", "500", "256"],
    explanation: "Perfect numbers (equal to sum of their proper divisors): 6, 28, 496."
  },
  {
    id: "happy-numbers-start",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["1", "7", "10", "13"],
    answer: "19",
    options: ["15", "17", "19", "21"],
    explanation: "Happy numbers in order: 1, 7, 10, 13, 19. Sum of squared digits eventually reaches 1."
  },
  {
    id: "seasons-emoji-cycle",
    category: "Nature",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌸", "🌻", "🍁"],
    answer: "⛄",
    options: ["⛄", "🌸", "🌻", "🎄"],
    explanation: "Seasons by symbol: cherry blossom (spring) → sunflower (summer) → maple leaf (fall) → snowman (winter)."
  },
  {
    id: "sunrise-to-stars",
    category: "Nature",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌅", "🌞", "🌇"],
    answer: "🌠",
    options: ["🌠", "🌅", "☁️", "🌞"],
    explanation: "Day to night: sunrise → bright sun → sunset → shooting star (night sky)."
  },
  {
    id: "dice-pairs",
    category: "Logic Sequences",
    difficulty: 2,
    type: "emoji",
    sequence: ["⚀⚅", "⚁⚄", "⚂⚃"],
    answer: "⚃⚂",
    options: ["⚃⚂", "⚀⚅", "⚄⚁", "⚅⚀"],
    explanation: "Dice pairs always sum to 7: (1,6), (2,5), (3,4), (4,3)."
  },
  {
    id: "pyramid-numbers",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["1", "4", "10", "20"],
    answer: "35",
    options: ["30", "35", "40", "25"],
    explanation: "Tetrahedral (pyramid) numbers: 1, 4, 10, 20, 35. Each is a sum of triangular numbers."
  },
  {
    id: "shipping-journey",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["🛒", "💳", "📦", "🚚"],
    answer: "🏠",
    options: ["🏠", "🛒", "📦", "✈️"],
    explanation: "Online shopping: cart → pay → package → delivery truck → arrives at home."
  },
  {
    id: "space-mission",
    category: "Science",
    difficulty: 2,
    type: "emoji",
    sequence: ["👨‍🚀", "🚀", "🌍", "🌙"],
    answer: "⭐",
    options: ["⭐", "🚀", "🌍", "🛸"],
    explanation: "Space mission journey: astronaut → launch → orbit Earth → Moon → stars (deep space)."
  },
  {
    id: "pizza-night",
    category: "Food",
    difficulty: 1,
    type: "emoji",
    sequence: ["📞", "🍕", "🚗"],
    answer: "😋",
    options: ["😋", "📞", "🍕", "💤"],
    explanation: "Pizza delivery night: call/order → pizza made → delivery → enjoy eating!"
  },
  {
    id: "painting-process",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["🎨", "🖌️", "🖼️"],
    answer: "🏛️",
    options: ["🏛️", "🎨", "🗑️", "🖌️"],
    explanation: "Art journey: palette/colors → paint → finished painting → displayed in gallery/museum."
  },
  {
    id: "beach-day",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["☀️", "🏖️", "🏊", "🍦"],
    answer: "🌅",
    options: ["🌅", "☀️", "🏖️", "🌊"],
    explanation: "Beach day: sunny weather → arrive at beach → swim → ice cream → sunset."
  },
  {
    id: "winter-sports",
    category: "Sports",
    difficulty: 1,
    type: "emoji",
    sequence: ["❄️", "⛷️", "🏂"],
    answer: "🛷",
    options: ["🛷", "⛷️", "🏊", "🏀"],
    explanation: "Winter sports sequence: snow falls → skiing → snowboarding → sledding."
  },
  {
    id: "roman-numerals-tens",
    category: "Letter & Word Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["X", "XX", "XXX", "XL"],
    answer: "L",
    options: ["L", "LX", "XLV", "C"],
    explanation: "Roman numerals counting by tens: 10, 20, 30, 40, 50 = X, XX, XXX, XL, L."
  },
  {
    id: "map-zoom-in",
    category: "Visual & Spatial",
    difficulty: 2,
    type: "emoji",
    sequence: ["🗺️", "🌍", "🏔️", "🏘️"],
    answer: "📍",
    options: ["📍", "🗺️", "🌍", "🏠"],
    explanation: "Zooming into a map: world map → globe view → mountain/region → town → pin/location."
  },
  {
    id: "knight-chess-journey",
    category: "Logic Sequences",
    difficulty: 3,
    type: "text",
    sequence: ["a1", "b3", "c5", "d7"],
    answer: "e9",
    options: ["e9", "f1", "d5", "c3"],
    explanation: "Pattern moves +1 letter, +2 number each time: a1 → b3 → c5 → d7 → e9."
  },
];
