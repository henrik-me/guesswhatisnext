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

  // ─── Geography ────────────────────────────────────
  {
    id: "geo-european-capitals",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["Paris","Berlin","Madrid"],
    answer: "Rome",
    options: ["Rome","Milan","Barcelona","Munich"],
    explanation: "Capital cities of France, Germany, Spain — next is Italy's capital: Rome."
  },
  {
    id: "geo-continents-size",
    category: "Geography",
    difficulty: 1,
    type: "text",
    sequence: ["Asia","Africa","North America"],
    answer: "South America",
    options: ["Europe","South America","Antarctica","Australia"],
    explanation: "Continents ordered by area from largest to smallest: Asia → Africa → N. America → S. America."
  },
  {
    id: "geo-oceans-size",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["Pacific","Atlantic","Indian"],
    answer: "Southern",
    options: ["Arctic","Southern","Mediterranean","Caribbean"],
    explanation: "Oceans ordered by size: Pacific → Atlantic → Indian → Southern → Arctic."
  },
  {
    id: "geo-longest-rivers",
    category: "Geography",
    difficulty: 3,
    type: "text",
    sequence: ["Nile","Amazon","Yangtze"],
    answer: "Mississippi",
    options: ["Mississippi","Thames","Danube","Rhine"],
    explanation: "World's longest rivers in order: Nile → Amazon → Yangtze → Mississippi."
  },
  {
    id: "geo-largest-countries",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["Russia","Canada","USA"],
    answer: "China",
    options: ["India","China","Brazil","Australia"],
    explanation: "Largest countries by area: Russia → Canada → USA → China."
  },
  {
    id: "geo-compass-directions",
    category: "Geography",
    difficulty: 1,
    type: "text",
    sequence: ["North","East","South"],
    answer: "West",
    options: ["West","Northeast","Down","Center"],
    explanation: "The four cardinal compass directions clockwise: North → East → South → West."
  },
  {
    id: "geo-asian-capitals",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["Tokyo","Beijing","Seoul"],
    answer: "Bangkok",
    options: ["Bangkok","Shanghai","Osaka","Taipei"],
    explanation: "Capital cities of Japan, China, South Korea — next is Thailand's capital: Bangkok."
  },
  {
    id: "geo-south-american-capitals",
    category: "Geography",
    difficulty: 3,
    type: "text",
    sequence: ["Brasília","Buenos Aires","Santiago"],
    answer: "Lima",
    options: ["Lima","São Paulo","Bogotá","Rio de Janeiro"],
    explanation: "Capitals of Brazil, Argentina, Chile — next is Peru's capital: Lima."
  },
  {
    id: "geo-earth-layers",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["Crust","Mantle","Outer Core"],
    answer: "Inner Core",
    options: ["Inner Core","Magma","Bedrock","Lithosphere"],
    explanation: "Earth's layers from outside in: Crust → Mantle → Outer Core → Inner Core."
  },
  {
    id: "geo-us-states-alphabetical",
    category: "Geography",
    difficulty: 1,
    type: "text",
    sequence: ["Alabama","Alaska","Arizona"],
    answer: "Arkansas",
    options: ["Arkansas","California","Colorado","Connecticut"],
    explanation: "US states in alphabetical order: Alabama → Alaska → Arizona → Arkansas."
  },
  {
    id: "geo-highest-mountains",
    category: "Geography",
    difficulty: 3,
    type: "text",
    sequence: ["Everest","K2","Kangchenjunga"],
    answer: "Lhotse",
    options: ["Lhotse","Denali","Kilimanjaro","Mont Blanc"],
    explanation: "World's highest mountains: Everest → K2 → Kangchenjunga → Lhotse."
  },
  {
    id: "geo-world-population",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["India","China","USA"],
    answer: "Indonesia",
    options: ["Indonesia","Brazil","Japan","Mexico"],
    explanation: "Most populous countries: India → China → USA → Indonesia."
  },
  {
    id: "geo-african-capitals",
    category: "Geography",
    difficulty: 3,
    type: "text",
    sequence: ["Cairo","Nairobi","Abuja"],
    answer: "Pretoria",
    options: ["Pretoria","Lagos","Addis Ababa","Casablanca"],
    explanation: "Capitals of Egypt, Kenya, Nigeria — next is South Africa's capital: Pretoria."
  },
  {
    id: "geo-deserts-size",
    category: "Geography",
    difficulty: 3,
    type: "text",
    sequence: ["Antarctic","Sahara","Arabian"],
    answer: "Gobi",
    options: ["Gobi","Mojave","Kalahari","Atacama"],
    explanation: "Largest deserts by area: Antarctic → Sahara → Arabian → Gobi."
  },
  {
    id: "geo-flag-tricolor-vert",
    category: "Geography",
    difficulty: 1,
    type: "emoji",
    sequence: ["🇫🇷","🇮🇹","🇮🇪"],
    answer: "🇧🇪",
    options: ["🇧🇪","🇯🇵","🇧🇷","🇨🇭"],
    explanation: "Flags with vertical tricolor stripes: France → Italy → Ireland → Belgium."
  },
  {
    id: "geo-island-nations",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["Japan","Philippines","Indonesia"],
    answer: "Madagascar",
    options: ["Madagascar","Brazil","India","Egypt"],
    explanation: "Large island nations from east to west: Japan → Philippines → Indonesia → Madagascar."
  },
  {
    id: "geo-great-lakes",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["Superior","Michigan","Huron"],
    answer: "Erie",
    options: ["Erie","Tahoe","Ontario","Victoria"],
    explanation: "The Great Lakes by surface area: Superior → Michigan → Huron → Erie → Ontario."
  },
  {
    id: "geo-tallest-buildings",
    category: "Geography",
    difficulty: 3,
    type: "text",
    sequence: ["Burj Khalifa","Merdeka 118","Shanghai Tower"],
    answer: "Abraj Al-Bait",
    options: ["Abraj Al-Bait","Empire State","Eiffel Tower","CN Tower"],
    explanation: "Tallest buildings in the world: Burj Khalifa → Merdeka 118 → Shanghai Tower → Abraj Al-Bait."
  },
  // ─── History ──────────────────────────────────────
  {
    id: "hist-ancient-civilizations",
    category: "History",
    difficulty: 2,
    type: "text",
    sequence: ["Mesopotamia","Egypt","Greece"],
    answer: "Rome",
    options: ["Rome","Aztec","Viking","Mongol"],
    explanation: "Major ancient civilizations in chronological order of rise: Mesopotamia → Egypt → Greece → Rome."
  },
  {
    id: "hist-world-wars",
    category: "History",
    difficulty: 1,
    type: "text",
    sequence: ["1914","1918","1939"],
    answer: "1945",
    options: ["1945","1950","1941","1942"],
    explanation: "WWI: 1914–1918, WWII: 1939–1945. The pattern shows start/end dates of both world wars."
  },
  {
    id: "hist-us-presidents-early",
    category: "History",
    difficulty: 2,
    type: "text",
    sequence: ["Washington","Adams","Jefferson"],
    answer: "Madison",
    options: ["Madison","Monroe","Lincoln","Hamilton"],
    explanation: "First US presidents in order: Washington → Adams → Jefferson → Madison."
  },
  {
    id: "hist-space-race",
    category: "History",
    difficulty: 2,
    type: "text",
    sequence: ["Sputnik 1957","Gagarin 1961","Apollo 11 1969"],
    answer: "Skylab 1973",
    options: ["Skylab 1973","Hubble 1980","ISS 1965","Viking 1960"],
    explanation: "Space race milestones: Sputnik → Gagarin → Moon landing → Skylab space station."
  },
  {
    id: "hist-egyptian-periods",
    category: "History",
    difficulty: 3,
    type: "text",
    sequence: ["Old Kingdom","Middle Kingdom","New Kingdom"],
    answer: "Late Period",
    options: ["Late Period","Early Period","Bronze Age","Iron Age"],
    explanation: "Egyptian historical periods: Old Kingdom → Middle Kingdom → New Kingdom → Late Period."
  },
  {
    id: "hist-inventions-timeline",
    category: "History",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔥","🏹","⚙️"],
    answer: "💡",
    options: ["💡","🔥","🗡️","🏰"],
    explanation: "Major inventions through history: fire → bow & arrow → mechanical wheel/gear → light bulb."
  },
  {
    id: "hist-transportation-evolution",
    category: "History",
    difficulty: 1,
    type: "emoji",
    sequence: ["🐴","🚂","🚗"],
    answer: "✈️",
    options: ["✈️","🚲","🛶","🐴"],
    explanation: "Transportation evolution: horse → train → car → airplane."
  },
  {
    id: "hist-communication-evolution",
    category: "History",
    difficulty: 1,
    type: "emoji",
    sequence: ["✉️","📞","💻"],
    answer: "📱",
    options: ["📱","📺","📻","✉️"],
    explanation: "Communication evolution: letter → telephone → computer → smartphone."
  },
  {
    id: "hist-roman-empire-phases",
    category: "History",
    difficulty: 3,
    type: "text",
    sequence: ["Kingdom","Republic","Empire"],
    answer: "Fall",
    options: ["Fall","Democracy","Renaissance","Feudalism"],
    explanation: "Phases of Roman civilization: Kingdom → Republic → Empire → Fall (476 AD)."
  },
  {
    id: "hist-renaissance-to-modern",
    category: "History",
    difficulty: 2,
    type: "text",
    sequence: ["Renaissance","Reformation","Enlightenment"],
    answer: "Industrial Revolution",
    options: ["Industrial Revolution","Dark Ages","Bronze Age","Cold War"],
    explanation: "European historical periods: Renaissance → Reformation → Enlightenment → Industrial Revolution."
  },
  {
    id: "hist-writing-systems",
    category: "History",
    difficulty: 3,
    type: "text",
    sequence: ["Cuneiform","Hieroglyphs","Greek Alphabet"],
    answer: "Latin Alphabet",
    options: ["Latin Alphabet","Binary","Morse Code","Braille"],
    explanation: "Writing systems in order of development: Cuneiform → Hieroglyphs → Greek → Latin alphabet."
  },
  {
    id: "hist-ages-of-man",
    category: "History",
    difficulty: 2,
    type: "text",
    sequence: ["Stone Age","Bronze Age","Iron Age"],
    answer: "Classical Age",
    options: ["Classical Age","Digital Age","Space Age","Ice Age"],
    explanation: "Ages of human civilization: Stone → Bronze → Iron → Classical."
  },
  {
    id: "hist-cold-war-events",
    category: "History",
    difficulty: 3,
    type: "text",
    sequence: ["NATO formed 1949","Korean War 1950","Cuban Missile Crisis 1962"],
    answer: "Moon Landing 1969",
    options: ["Moon Landing 1969","Vietnam War 1945","Berlin Wall 1940","Sputnik 1970"],
    explanation: "Cold War milestones: NATO → Korean War → Cuban Missile Crisis → Moon Landing."
  },
  {
    id: "hist-uk-monarchs",
    category: "History",
    difficulty: 3,
    type: "text",
    sequence: ["Victoria","Edward VII","George V"],
    answer: "Edward VIII",
    options: ["Edward VIII","George IV","Elizabeth I","Henry VIII"],
    explanation: "British monarchs in order: Victoria → Edward VII → George V → Edward VIII."
  },
  {
    id: "hist-dynasty-china",
    category: "History",
    difficulty: 3,
    type: "text",
    sequence: ["Han","Tang","Song"],
    answer: "Ming",
    options: ["Ming","Qin","Zhou","Shang"],
    explanation: "Major Chinese dynasties in chronological order: Han → Tang → Song → Ming."
  },
  {
    id: "hist-money-evolution",
    category: "History",
    difficulty: 1,
    type: "emoji",
    sequence: ["🐚","🪙","💵"],
    answer: "💳",
    options: ["💳","🪙","🏦","💰"],
    explanation: "Evolution of money: shells → coins → paper bills → credit cards."
  },
  {
    id: "hist-greek-philosophers",
    category: "History",
    difficulty: 2,
    type: "text",
    sequence: ["Socrates","Plato","Aristotle"],
    answer: "Alexander",
    options: ["Alexander","Homer","Pythagoras","Herodotus"],
    explanation: "Each taught the next: Socrates → Plato → Aristotle → Alexander the Great."
  },
  // ─── Technology ───────────────────────────────────
  {
    id: "tech-storage-evolution",
    category: "Technology",
    difficulty: 1,
    type: "emoji",
    sequence: ["💾","💿","🔌"],
    answer: "☁️",
    options: ["☁️","💾","📼","🖨️"],
    explanation: "Storage evolution: floppy disk → CD → USB drive → cloud storage."
  },
  {
    id: "tech-web-versions",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["Web 1.0","Web 2.0","Web 3.0"],
    answer: "Web 4.0",
    options: ["Web 4.0","Web 2.5","Web 5.0","Internet 2"],
    explanation: "Web evolution: static pages (1.0) → social/interactive (2.0) → decentralized (3.0) → AI-driven (4.0)."
  },
  {
    id: "tech-programming-generations",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["Machine Code","Assembly","C"],
    answer: "Python",
    options: ["Python","Binary","HTML","Punch Cards"],
    explanation: "Programming language generations from low to high level: Machine Code → Assembly → C → Python."
  },
  {
    id: "tech-mobile-generations",
    category: "Technology",
    difficulty: 1,
    type: "text",
    sequence: ["2G","3G","4G"],
    answer: "5G",
    options: ["5G","6G","4.5G","WiFi"],
    explanation: "Mobile network generations: 2G → 3G → 4G → 5G."
  },
  {
    id: "tech-apple-devices",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["iPod","iPhone","iPad"],
    answer: "Apple Watch",
    options: ["Apple Watch","iMac","MacBook","iTunes"],
    explanation: "Apple's major product launches in order: iPod (2001) → iPhone (2007) → iPad (2010) → Apple Watch (2015)."
  },
  {
    id: "tech-data-units",
    category: "Technology",
    difficulty: 1,
    type: "text",
    sequence: ["Byte","Kilobyte","Megabyte"],
    answer: "Gigabyte",
    options: ["Gigabyte","Terabyte","Bit","Nibble"],
    explanation: "Data units in ascending order: Byte → Kilobyte → Megabyte → Gigabyte."
  },
  {
    id: "tech-social-media-timeline",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["MySpace","Facebook","Twitter"],
    answer: "Instagram",
    options: ["Instagram","Friendster","LinkedIn","AOL"],
    explanation: "Major social media platforms by launch: MySpace (2003) → Facebook (2004) → Twitter (2006) → Instagram (2010)."
  },
  {
    id: "tech-computer-input",
    category: "Technology",
    difficulty: 1,
    type: "emoji",
    sequence: ["⌨️","🖱️","🎤"],
    answer: "👆",
    options: ["👆","🖨️","📷","🔊"],
    explanation: "Computer input evolution: keyboard → mouse → voice → touch screen."
  },
  {
    id: "tech-gaming-consoles",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["Atari","NES","PlayStation"],
    answer: "Xbox",
    options: ["Xbox","Sega","Commodore","Pong"],
    explanation: "Landmark gaming consoles: Atari (1977) → NES (1985) → PlayStation (1994) → Xbox (2001)."
  },
  {
    id: "tech-internet-protocols",
    category: "Technology",
    difficulty: 3,
    type: "text",
    sequence: ["HTTP","HTTPS","HTTP/2"],
    answer: "HTTP/3",
    options: ["HTTP/3","HTTP/4","FTP","TCP"],
    explanation: "Web protocol evolution: HTTP → HTTPS → HTTP/2 → HTTP/3 (QUIC)."
  },
  {
    id: "tech-display-resolution",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["480p","720p","1080p"],
    answer: "4K",
    options: ["4K","8K","360p","HD"],
    explanation: "Display resolution progression: 480p → 720p → 1080p → 4K (2160p)."
  },
  {
    id: "tech-ai-milestones",
    category: "Technology",
    difficulty: 3,
    type: "text",
    sequence: ["Deep Blue 1997","Watson 2011","AlphaGo 2016"],
    answer: "ChatGPT 2022",
    options: ["ChatGPT 2022","Siri 2005","Alexa 2000","Cortana 2010"],
    explanation: "AI milestones: Deep Blue beat chess → Watson beat Jeopardy → AlphaGo beat Go → ChatGPT launched."
  },
  {
    id: "tech-os-timeline",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["MS-DOS","Windows 95","Windows XP"],
    answer: "Windows 10",
    options: ["Windows 10","Windows ME","Windows 3.1","Linux"],
    explanation: "Major Windows releases: MS-DOS → Windows 95 → Windows XP → Windows 10."
  },
  {
    id: "tech-bluetooth-versions",
    category: "Technology",
    difficulty: 3,
    type: "text",
    sequence: ["Bluetooth 2.0","Bluetooth 3.0","Bluetooth 4.0"],
    answer: "Bluetooth 5.0",
    options: ["Bluetooth 5.0","Bluetooth 4.5","WiFi 6","NFC 2.0"],
    explanation: "Bluetooth version progression: 2.0 → 3.0 → 4.0 → 5.0."
  },
  {
    id: "tech-binary-powers",
    category: "Technology",
    difficulty: 1,
    type: "text",
    sequence: ["1","2","4","8"],
    answer: "16",
    options: ["16","10","12","15"],
    explanation: "Powers of 2 (fundamental in computing): 1, 2, 4, 8, 16, 32, 64..."
  },
  {
    id: "tech-screen-types",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["CRT","LCD","LED"],
    answer: "OLED",
    options: ["OLED","Plasma","VGA","DLP"],
    explanation: "Display technology evolution: CRT → LCD → LED → OLED."
  },
  {
    id: "tech-usb-versions",
    category: "Technology",
    difficulty: 2,
    type: "text",
    sequence: ["USB 1.0","USB 2.0","USB 3.0"],
    answer: "USB 4.0",
    options: ["USB 4.0","USB 3.5","Thunderbolt","FireWire"],
    explanation: "USB standard progression: 1.0 → 2.0 → 3.0 → 4.0."
  },
  // ─── Art & Design ─────────────────────────────────
  {
    id: "art-primary-colors",
    category: "Art & Design",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴","🔵"],
    answer: "🟡",
    options: ["🟡","🟢","🟠","🟣"],
    explanation: "The three primary colors in traditional color theory: Red, Blue, Yellow."
  },
  {
    id: "art-rainbow-order",
    category: "Art & Design",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴","🟠","🟡","🟢"],
    answer: "🔵",
    options: ["🔵","🟣","⚪","🟤"],
    explanation: "Rainbow order (ROYGBIV): Red → Orange → Yellow → Green → Blue."
  },
  {
    id: "art-movements-timeline",
    category: "Art & Design",
    difficulty: 2,
    type: "text",
    sequence: ["Renaissance","Baroque","Impressionism"],
    answer: "Cubism",
    options: ["Cubism","Gothic","Romanticism","Prehistoric"],
    explanation: "Art movements in chronological order: Renaissance → Baroque → Impressionism → Cubism."
  },
  {
    id: "art-color-wheel-warm",
    category: "Art & Design",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴","🟠"],
    answer: "🟡",
    options: ["🟡","🔵","🟣","🟤"],
    explanation: "Warm colors on the color wheel progress: Red → Orange → Yellow."
  },
  {
    id: "art-pencil-grades",
    category: "Art & Design",
    difficulty: 2,
    type: "text",
    sequence: ["2H","H","HB"],
    answer: "B",
    options: ["B","2B","F","3H"],
    explanation: "Pencil hardness grades from hard to soft: 2H → H → HB → B."
  },
  {
    id: "art-famous-painters",
    category: "Art & Design",
    difficulty: 2,
    type: "text",
    sequence: ["Da Vinci","Rembrandt","Monet"],
    answer: "Picasso",
    options: ["Picasso","Michelangelo","Raphael","Vermeer"],
    explanation: "Famous painters in chronological order: Da Vinci (1500s) → Rembrandt (1600s) → Monet (1800s) → Picasso (1900s)."
  },
  {
    id: "art-sculpture-evolution",
    category: "Art & Design",
    difficulty: 3,
    type: "text",
    sequence: ["Greek Classical","Roman","Gothic"],
    answer: "Renaissance",
    options: ["Renaissance","Prehistoric","Modern","Baroque"],
    explanation: "Sculpture style evolution: Greek Classical → Roman → Gothic → Renaissance."
  },
  {
    id: "art-photography-evolution",
    category: "Art & Design",
    difficulty: 2,
    type: "emoji",
    sequence: ["📷","🎞️","📸"],
    answer: "🤳",
    options: ["🤳","🖼️","🎨","📹"],
    explanation: "Photography evolution: early camera → film camera → digital camera → selfie/smartphone camera."
  },
  {
    id: "art-architecture-styles",
    category: "Art & Design",
    difficulty: 3,
    type: "text",
    sequence: ["Egyptian","Greek","Roman"],
    answer: "Gothic",
    options: ["Gothic","Modern","Art Deco","Baroque"],
    explanation: "Architectural styles in chronological order: Egyptian → Greek → Roman → Gothic."
  },
  {
    id: "art-design-principles",
    category: "Art & Design",
    difficulty: 2,
    type: "text",
    sequence: ["Line","Shape","Form"],
    answer: "Texture",
    options: ["Texture","Paragraph","Margin","Pixel"],
    explanation: "Elements of art: Line → Shape → Form → Texture → Value → Space → Color."
  },
  {
    id: "art-paper-sizes",
    category: "Art & Design",
    difficulty: 2,
    type: "text",
    sequence: ["A1","A2","A3"],
    answer: "A4",
    options: ["A4","A0","B5","A10"],
    explanation: "Standard paper sizes getting smaller: A1 → A2 → A3 → A4."
  },
  {
    id: "art-music-to-film",
    category: "Art & Design",
    difficulty: 1,
    type: "emoji",
    sequence: ["🎨","🎭","🎵"],
    answer: "🎬",
    options: ["🎬","📚","🎪","🏛️"],
    explanation: "Art forms through history: visual art → theater → music → cinema."
  },
  {
    id: "art-warm-to-cool",
    category: "Art & Design",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴","🟡","🟢"],
    answer: "🔵",
    options: ["🔵","🟠","🟤","⚫"],
    explanation: "Color temperature transition from warm to cool: Red → Yellow → Green → Blue."
  },
  // ─── Language & Grammar ───────────────────────────
  {
    id: "lang-vowels",
    category: "Language & Grammar",
    difficulty: 1,
    type: "text",
    sequence: ["A","E","I"],
    answer: "O",
    options: ["O","U","B","Y"],
    explanation: "English vowels in order: A, E, I, O, U."
  },
  {
    id: "lang-tenses",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["Past","Present"],
    answer: "Future",
    options: ["Future","Perfect","Pluperfect","Conditional"],
    explanation: "The three basic tenses: Past → Present → Future."
  },
  {
    id: "lang-sentence-structure",
    category: "Language & Grammar",
    difficulty: 1,
    type: "text",
    sequence: ["Subject","Verb"],
    answer: "Object",
    options: ["Object","Adjective","Comma","Period"],
    explanation: "Basic English sentence structure: Subject → Verb → Object (SVO)."
  },
  {
    id: "lang-parts-of-speech",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["Noun","Verb","Adjective"],
    answer: "Adverb",
    options: ["Adverb","Sentence","Paragraph","Syllable"],
    explanation: "Common parts of speech: Noun → Verb → Adjective → Adverb."
  },
  {
    id: "lang-greek-alphabet-start",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["Alpha","Beta","Gamma"],
    answer: "Delta",
    options: ["Delta","Epsilon","Omega","Sigma"],
    explanation: "First four letters of the Greek alphabet: Alpha → Beta → Gamma → Delta."
  },
  {
    id: "lang-roman-numerals",
    category: "Language & Grammar",
    difficulty: 1,
    type: "text",
    sequence: ["I","II","III"],
    answer: "IV",
    options: ["IV","IIII","V","VI"],
    explanation: "Roman numerals: I (1), II (2), III (3), IV (4)."
  },
  {
    id: "lang-phonetic-alphabet",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["Alpha","Bravo","Charlie"],
    answer: "Delta",
    options: ["Delta","Echo","Dog","David"],
    explanation: "NATO phonetic alphabet: Alpha → Bravo → Charlie → Delta."
  },
  {
    id: "lang-punctuation-hierarchy",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["Period","Comma","Semicolon"],
    answer: "Colon",
    options: ["Colon","Dash","Paragraph","Space"],
    explanation: "Common punctuation marks: Period → Comma → Semicolon → Colon."
  },
  {
    id: "lang-prefixes-size",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["micro","milli","centi"],
    answer: "deci",
    options: ["deci","kilo","mega","nano"],
    explanation: "Metric prefixes from smallest to largest: micro → milli → centi → deci."
  },
  {
    id: "lang-book-structure",
    category: "Language & Grammar",
    difficulty: 1,
    type: "text",
    sequence: ["Letter","Word","Sentence"],
    answer: "Paragraph",
    options: ["Paragraph","Chapter","Page","Syllable"],
    explanation: "Text units from smallest to largest: Letter → Word → Sentence → Paragraph."
  },
  {
    id: "lang-spanish-numbers",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["uno","dos","tres"],
    answer: "cuatro",
    options: ["cuatro","cinco","quattro","quatro"],
    explanation: "Counting in Spanish: uno (1), dos (2), tres (3), cuatro (4)."
  },
  {
    id: "lang-french-numbers",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["un","deux","trois"],
    answer: "quatre",
    options: ["quatre","cinq","quatro","fünf"],
    explanation: "Counting in French: un (1), deux (2), trois (3), quatre (4)."
  },
  {
    id: "lang-japanese-numbers",
    category: "Language & Grammar",
    difficulty: 3,
    type: "text",
    sequence: ["ichi","ni","san"],
    answer: "shi",
    options: ["shi","go","roku","hachi"],
    explanation: "Counting in Japanese: ichi (1), ni (2), san (3), shi (4)."
  },
  {
    id: "lang-writing-tools",
    category: "Language & Grammar",
    difficulty: 1,
    type: "emoji",
    sequence: ["🪶","✒️","✏️"],
    answer: "🖊️",
    options: ["🖊️","📱","🖨️","📋"],
    explanation: "Evolution of writing tools: quill → fountain pen → pencil → ballpoint pen."
  },
  {
    id: "lang-literary-genres",
    category: "Language & Grammar",
    difficulty: 2,
    type: "text",
    sequence: ["Poetry","Drama","Novel"],
    answer: "Short Story",
    options: ["Short Story","Alphabet","Dictionary","Grammar"],
    explanation: "Literary forms in historical order of development: Poetry → Drama → Novel → Short Story."
  },
  // ─── Science ──────────────────────────────────────
  {
    id: "sci-planets-order",
    category: "Science",
    difficulty: 1,
    type: "text",
    sequence: ["Mercury","Venus","Earth"],
    answer: "Mars",
    options: ["Mars","Jupiter","Saturn","Moon"],
    explanation: "Planets from the Sun: Mercury → Venus → Earth → Mars."
  },
  {
    id: "sci-periodic-first-four",
    category: "Science",
    difficulty: 2,
    type: "text",
    sequence: ["Hydrogen","Helium","Lithium"],
    answer: "Beryllium",
    options: ["Beryllium","Carbon","Boron","Nitrogen"],
    explanation: "First elements of the periodic table: Hydrogen (1) → Helium (2) → Lithium (3) → Beryllium (4)."
  },
  {
    id: "sci-states-of-matter",
    category: "Science",
    difficulty: 1,
    type: "text",
    sequence: ["Solid","Liquid"],
    answer: "Gas",
    options: ["Gas","Plasma","Vapor","Ice"],
    explanation: "States of matter by increasing energy: Solid → Liquid → Gas."
  },
  {
    id: "sci-cell-division",
    category: "Science",
    difficulty: 3,
    type: "text",
    sequence: ["Interphase","Prophase","Metaphase"],
    answer: "Anaphase",
    options: ["Anaphase","Telophase","Cytokinesis","G1 Phase"],
    explanation: "Stages of mitosis: Interphase → Prophase → Metaphase → Anaphase → Telophase."
  },
  {
    id: "sci-electromagnetic-spectrum",
    category: "Science",
    difficulty: 2,
    type: "text",
    sequence: ["Radio","Microwave","Infrared"],
    answer: "Visible Light",
    options: ["Visible Light","X-ray","Gamma","Sound"],
    explanation: "EM spectrum by wavelength: Radio → Microwave → Infrared → Visible Light."
  },
  {
    id: "sci-taxonomy",
    category: "Science",
    difficulty: 3,
    type: "text",
    sequence: ["Kingdom","Phylum","Class"],
    answer: "Order",
    options: ["Order","Species","Domain","Genus"],
    explanation: "Taxonomy hierarchy: Kingdom → Phylum → Class → Order → Family → Genus → Species."
  },
  {
    id: "sci-rock-cycle",
    category: "Science",
    difficulty: 2,
    type: "text",
    sequence: ["Igneous","Sedimentary"],
    answer: "Metamorphic",
    options: ["Metamorphic","Calcium","Volcanic","Crystal"],
    explanation: "The three main rock types in the rock cycle: Igneous → Sedimentary → Metamorphic."
  },
  {
    id: "sci-human-body-systems",
    category: "Science",
    difficulty: 2,
    type: "text",
    sequence: ["Skeletal","Muscular","Circulatory"],
    answer: "Nervous",
    options: ["Nervous","Battery","Mechanical","Digital"],
    explanation: "Major body systems: Skeletal → Muscular → Circulatory → Nervous."
  },
  {
    id: "sci-ph-scale",
    category: "Science",
    difficulty: 2,
    type: "text",
    sequence: ["Acid","Neutral"],
    answer: "Base",
    options: ["Base","Salt","Water","Ion"],
    explanation: "The pH scale goes from Acid (0-6) → Neutral (7) → Base (8-14)."
  },
  {
    id: "sci-gas-giants",
    category: "Science",
    difficulty: 2,
    type: "text",
    sequence: ["Jupiter","Saturn"],
    answer: "Uranus",
    options: ["Uranus","Mars","Venus","Pluto"],
    explanation: "Outer planets in order: Jupiter → Saturn → Uranus → Neptune."
  },
  {
    id: "sci-scientific-method",
    category: "Science",
    difficulty: 1,
    type: "text",
    sequence: ["Question","Hypothesis","Experiment"],
    answer: "Conclusion",
    options: ["Conclusion","Guess","Theory","Law"],
    explanation: "The scientific method: Question → Hypothesis → Experiment → Conclusion."
  },
  {
    id: "sci-dna-bases",
    category: "Science",
    difficulty: 3,
    type: "text",
    sequence: ["Adenine","Thymine","Guanine"],
    answer: "Cytosine",
    options: ["Cytosine","Uracil","Ribose","Amino"],
    explanation: "The four DNA bases: Adenine, Thymine, Guanine, Cytosine. They pair A-T and G-C."
  },
  {
    id: "sci-speed-of-things",
    category: "Science",
    difficulty: 2,
    type: "emoji",
    sequence: ["🐌","🚶","🚗"],
    answer: "✈️",
    options: ["✈️","🚲","🐇","🚂"],
    explanation: "Increasing speed: snail → walking → car → airplane."
  },
  {
    id: "sci-lab-equipment",
    category: "Science",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔬","🧪","⚗️"],
    answer: "🧫",
    options: ["🧫","🔭","📐","🖩"],
    explanation: "Laboratory equipment getting smaller: microscope → test tube → flask → petri dish."
  },
  {
    id: "sci-newton-laws",
    category: "Science",
    difficulty: 3,
    type: "text",
    sequence: ["Inertia","F=ma"],
    answer: "Action-Reaction",
    options: ["Action-Reaction","Gravity","Friction","Momentum"],
    explanation: "Newton's three laws of motion: 1st (Inertia) → 2nd (F=ma) → 3rd (Action-Reaction)."
  },
  // ─── Sports ───────────────────────────────────────
  {
    id: "sport-olympic-host-recent",
    category: "Sports",
    difficulty: 2,
    type: "text",
    sequence: ["London 2012","Rio 2016","Tokyo 2020"],
    answer: "Paris 2024",
    options: ["Paris 2024","Beijing 2024","LA 2024","Sydney 2024"],
    explanation: "Recent Summer Olympic host cities: London → Rio → Tokyo → Paris."
  },
  {
    id: "sport-world-cup-hosts",
    category: "Sports",
    difficulty: 3,
    type: "text",
    sequence: ["Brazil 2014","Russia 2018","Qatar 2022"],
    answer: "USA/Canada/Mexico 2026",
    options: ["USA/Canada/Mexico 2026","Japan 2026","Australia 2026","England 2026"],
    explanation: "Recent FIFA World Cup hosts: Brazil → Russia → Qatar → USA/Canada/Mexico."
  },
  {
    id: "sport-tennis-grand-slams",
    category: "Sports",
    difficulty: 2,
    type: "text",
    sequence: ["Australian Open","French Open","Wimbledon"],
    answer: "US Open",
    options: ["US Open","Indian Wells","ATP Finals","Davis Cup"],
    explanation: "Tennis Grand Slams in calendar order: Australian Open → French Open → Wimbledon → US Open."
  },
  {
    id: "sport-track-distances",
    category: "Sports",
    difficulty: 1,
    type: "text",
    sequence: ["100m","200m","400m"],
    answer: "800m",
    options: ["800m","500m","1000m","300m"],
    explanation: "Standard Olympic track events: 100m → 200m → 400m → 800m (each roughly doubling)."
  },
  {
    id: "sport-medal-order",
    category: "Sports",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥇","🥈"],
    answer: "🥉",
    options: ["🥉","🏅","🎖️","⭐"],
    explanation: "Olympic medal order: Gold 🥇 → Silver 🥈 → Bronze 🥉."
  },
  {
    id: "sport-karate-belts",
    category: "Sports",
    difficulty: 2,
    type: "text",
    sequence: ["White","Yellow","Orange"],
    answer: "Green",
    options: ["Green","Black","Red","Blue"],
    explanation: "Karate belt progression: White → Yellow → Orange → Green."
  },
  {
    id: "sport-baseball-bases",
    category: "Sports",
    difficulty: 1,
    type: "text",
    sequence: ["Home","First","Second"],
    answer: "Third",
    options: ["Third","Pitcher","Outfield","Dugout"],
    explanation: "Baseball base running order: Home → First → Second → Third."
  },
  {
    id: "sport-triathlon-events",
    category: "Sports",
    difficulty: 2,
    type: "emoji",
    sequence: ["🏊","🚴"],
    answer: "🏃",
    options: ["🏃","🏇","⛷️","🤸"],
    explanation: "Triathlon events in order: Swim 🏊 → Bike 🚴 → Run 🏃."
  },
  {
    id: "sport-golf-par",
    category: "Sports",
    difficulty: 2,
    type: "text",
    sequence: ["Eagle","Birdie","Par"],
    answer: "Bogey",
    options: ["Bogey","Hole-in-one","Albatross","Double Eagle"],
    explanation: "Golf scores relative to par: Eagle (-2) → Birdie (-1) → Par (0) → Bogey (+1)."
  },
  {
    id: "sport-chess-pieces-value",
    category: "Sports",
    difficulty: 3,
    type: "text",
    sequence: ["Pawn (1)","Knight (3)","Bishop (3)"],
    answer: "Rook (5)",
    options: ["Rook (5)","Queen (9)","King (∞)","Pawn (2)"],
    explanation: "Chess piece values: Pawn (1) → Knight (3) → Bishop (3) → Rook (5)."
  },
  {
    id: "sport-soccer-positions",
    category: "Sports",
    difficulty: 1,
    type: "text",
    sequence: ["Goalkeeper","Defender","Midfielder"],
    answer: "Forward",
    options: ["Forward","Referee","Coach","Substitute"],
    explanation: "Soccer positions from back to front: Goalkeeper → Defender → Midfielder → Forward."
  },
  {
    id: "sport-swimming-strokes",
    category: "Sports",
    difficulty: 2,
    type: "text",
    sequence: ["Butterfly","Backstroke","Breaststroke"],
    answer: "Freestyle",
    options: ["Freestyle","Doggy Paddle","Sidestroke","Float"],
    explanation: "Individual medley swimming order: Butterfly → Backstroke → Breaststroke → Freestyle."
  },
  // ─── Food ─────────────────────────────────────────
  {
    id: "food-courses-formal",
    category: "Food",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥗","🍜","🥩"],
    answer: "🍰",
    options: ["🍰","🥗","🍞","🧃"],
    explanation: "Formal dinner courses: salad → soup → main course → dessert."
  },
  {
    id: "food-spice-heat",
    category: "Food",
    difficulty: 2,
    type: "emoji",
    sequence: ["🫑","🌶️","🌶️🌶️"],
    answer: "🌶️🌶️🌶️",
    options: ["🌶️🌶️🌶️","🍅","🥒","🧊"],
    explanation: "Increasing spice levels: bell pepper (mild) → one chili → two chilies → three chilies (hot!)."
  },
  {
    id: "food-coffee-strength",
    category: "Food",
    difficulty: 2,
    type: "text",
    sequence: ["Decaf","Americano","Latte"],
    answer: "Espresso",
    options: ["Espresso","Water","Tea","Milk"],
    explanation: "Coffee drinks by strength: Decaf → Americano → Latte → Espresso."
  },
  {
    id: "food-bread-making",
    category: "Food",
    difficulty: 1,
    type: "text",
    sequence: ["Mix","Knead","Rise"],
    answer: "Bake",
    options: ["Bake","Freeze","Fry","Grill"],
    explanation: "Bread making steps: Mix ingredients → Knead dough → Let it Rise → Bake."
  },
  {
    id: "food-egg-cooking",
    category: "Food",
    difficulty: 1,
    type: "text",
    sequence: ["Raw","Soft-boiled","Medium-boiled"],
    answer: "Hard-boiled",
    options: ["Hard-boiled","Scrambled","Poached","Fried"],
    explanation: "Egg doneness by cooking time: Raw → Soft-boiled → Medium-boiled → Hard-boiled."
  },
  {
    id: "food-sushi-progression",
    category: "Food",
    difficulty: 2,
    type: "emoji",
    sequence: ["🍚","🥢","🐟"],
    answer: "🍣",
    options: ["🍣","🍕","🍔","🌮"],
    explanation: "Making sushi: rice → chopsticks → fish → sushi roll!"
  },
  {
    id: "food-wine-colors",
    category: "Food",
    difficulty: 1,
    type: "text",
    sequence: ["White","Rosé"],
    answer: "Red",
    options: ["Red","Blue","Green","Purple"],
    explanation: "Wine categories by color depth: White → Rosé → Red."
  },
  {
    id: "food-pasta-sizes",
    category: "Food",
    difficulty: 2,
    type: "text",
    sequence: ["Orzo","Penne","Rigatoni"],
    answer: "Lasagna",
    options: ["Lasagna","Angel Hair","Couscous","Rice"],
    explanation: "Pasta types from smallest to largest: Orzo → Penne → Rigatoni → Lasagna sheets."
  },
  {
    id: "food-fruit-seasons",
    category: "Food",
    difficulty: 1,
    type: "emoji",
    sequence: ["🍓","🍑","🍎"],
    answer: "🍊",
    options: ["🍊","🍓","🍇","🍉"],
    explanation: "Seasonal fruits: Strawberry (spring) → Peach (summer) → Apple (fall) → Orange (winter)."
  },
  {
    id: "food-tea-oxidation",
    category: "Food",
    difficulty: 3,
    type: "text",
    sequence: ["White","Green","Oolong"],
    answer: "Black",
    options: ["Black","Herbal","Chamomile","Mint"],
    explanation: "Tea types by oxidation level: White (least) → Green → Oolong → Black (most)."
  },
  {
    id: "food-pizza-making",
    category: "Food",
    difficulty: 1,
    type: "emoji",
    sequence: ["🫓","🍅","🧀"],
    answer: "🍕",
    options: ["🍕","🥖","🌮","🍝"],
    explanation: "Making pizza: dough → tomato sauce → cheese → pizza is ready!"
  },
  // ─── Animals ──────────────────────────────────────
  {
    id: "animal-size-land",
    category: "Animals",
    difficulty: 1,
    type: "emoji",
    sequence: ["🐜","🐁","🐈"],
    answer: "🐕",
    options: ["🐕","🦠","🐛","🐜"],
    explanation: "Land animals by size: ant → mouse → cat → dog."
  },
  {
    id: "animal-life-stages-butterfly",
    category: "Animals",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥚","🐛","🫘"],
    answer: "🦋",
    options: ["🦋","🐝","🐞","🪲"],
    explanation: "Butterfly life cycle: egg → caterpillar → chrysalis → butterfly."
  },
  {
    id: "animal-life-stages-frog",
    category: "Animals",
    difficulty: 1,
    type: "emoji",
    sequence: ["🥚","〰️","🧒"],
    answer: "🐸",
    options: ["🐸","🐍","🦎","🐢"],
    explanation: "Frog life cycle: egg → tadpole → froglet → adult frog (🐸)."
  },
  {
    id: "animal-fastest-land",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🐢","🐇","🐎"],
    answer: "🐆",
    options: ["🐆","🐌","🐘","🦥"],
    explanation: "Animals by speed: turtle → rabbit → horse → cheetah (fastest land animal)."
  },
  {
    id: "animal-ocean-size",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🦐","🐟","🐬"],
    answer: "🐋",
    options: ["🐋","🦑","🐙","🦀"],
    explanation: "Ocean creatures by size: shrimp → fish → dolphin → whale."
  },
  {
    id: "animal-domestication",
    category: "Animals",
    difficulty: 3,
    type: "emoji",
    sequence: ["🐕","🐑","🐄"],
    answer: "🐔",
    options: ["🐔","🦁","🐻","🦊"],
    explanation: "Animals by approximate domestication order: dog → sheep → cattle → chicken."
  },
  {
    id: "animal-bird-sizes",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🐦","🦆","🦢"],
    answer: "🦅",
    options: ["🦅","🐣","🐧","🦜"],
    explanation: "Birds by size: sparrow → duck → swan → eagle."
  },
  {
    id: "animal-predator-chain",
    category: "Animals",
    difficulty: 2,
    type: "emoji",
    sequence: ["🌿","🐁","🐍"],
    answer: "🦅",
    options: ["🦅","🐜","🐛","🐸"],
    explanation: "Food chain: grass → mouse → snake → eagle."
  },
  {
    id: "animal-life-span",
    category: "Animals",
    difficulty: 3,
    type: "emoji",
    sequence: ["🪰","🐁","🐕"],
    answer: "🐘",
    options: ["🐘","🐈","🐇","🐓"],
    explanation: "Animals by lifespan: fly (days) → mouse (2yr) → dog (13yr) → elephant (70yr)."
  },
  {
    id: "animal-insect-to-mammal",
    category: "Animals",
    difficulty: 1,
    type: "emoji",
    sequence: ["🐛","🐟","🦎"],
    answer: "🐒",
    options: ["🐒","🪱","🦠","🐚"],
    explanation: "Increasing complexity: insect → fish → reptile → primate."
  },
  // ─── Music ────────────────────────────────────────
  {
    id: "music-note-values",
    category: "Music",
    difficulty: 2,
    type: "text",
    sequence: ["Whole","Half","Quarter"],
    answer: "Eighth",
    options: ["Eighth","Third","Fifth","Double"],
    explanation: "Musical note durations, each half the previous: Whole → Half → Quarter → Eighth."
  },
  {
    id: "music-do-re-mi",
    category: "Music",
    difficulty: 1,
    type: "text",
    sequence: ["Do","Re","Mi"],
    answer: "Fa",
    options: ["Fa","Sol","La","Ti"],
    explanation: "Solfège scale: Do, Re, Mi, Fa, Sol, La, Ti, Do."
  },
  {
    id: "music-instrument-families",
    category: "Music",
    difficulty: 2,
    type: "text",
    sequence: ["Strings","Woodwinds","Brass"],
    answer: "Percussion",
    options: ["Percussion","Electronic","Vocals","Piano"],
    explanation: "Orchestra instrument families: Strings → Woodwinds → Brass → Percussion."
  },
  {
    id: "music-volume-levels",
    category: "Music",
    difficulty: 2,
    type: "text",
    sequence: ["pianissimo","piano","mezzo-piano"],
    answer: "mezzo-forte",
    options: ["mezzo-forte","fortissimo","forte","sforzando"],
    explanation: "Musical dynamics from quiet to loud: pp → p → mp → mf."
  },
  {
    id: "music-decades-genres",
    category: "Music",
    difficulty: 2,
    type: "text",
    sequence: ["Jazz (1920s)","Rock (1960s)","Disco (1970s)"],
    answer: "Hip-Hop (1980s)",
    options: ["Hip-Hop (1980s)","Classical (1990s)","Opera (2000s)","Blues (1980s)"],
    explanation: "Dominant music genres by decade: Jazz → Rock → Disco → Hip-Hop."
  },
  {
    id: "music-string-instruments",
    category: "Music",
    difficulty: 2,
    type: "text",
    sequence: ["Violin","Viola","Cello"],
    answer: "Double Bass",
    options: ["Double Bass","Guitar","Harp","Banjo"],
    explanation: "String family from highest to lowest pitch: Violin → Viola → Cello → Double Bass."
  },
  {
    id: "music-band-formation",
    category: "Music",
    difficulty: 1,
    type: "emoji",
    sequence: ["🎸","🥁","🎤"],
    answer: "🎵",
    options: ["🎵","🎹","📻","📢"],
    explanation: "Forming a band: guitar → drums → vocals → music! A band makes music together."
  },
  {
    id: "music-crescendo",
    category: "Music",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔈","🔉","🔊"],
    answer: "📢",
    options: ["📢","🔇","🔕","🔈"],
    explanation: "Getting louder (crescendo): quiet → medium → loud → maximum volume."
  },
  // ─── Math & Numbers ───────────────────────────────
  {
    id: "math-square-numbers",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["1","4","9","16"],
    answer: "25",
    options: ["25","20","24","36"],
    explanation: "Perfect squares: 1², 2², 3², 4², 5² = 1, 4, 9, 16, 25."
  },
  {
    id: "math-cube-numbers",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["1","8","27"],
    answer: "64",
    options: ["64","36","81","100"],
    explanation: "Perfect cubes: 1³=1, 2³=8, 3³=27, 4³=64."
  },
  {
    id: "math-triangular-numbers",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["1","3","6","10"],
    answer: "15",
    options: ["15","12","14","20"],
    explanation: "Triangular numbers: 1, 3, 6, 10, 15. Each adds one more than the previous gap."
  },
  {
    id: "math-powers-of-ten",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["10","100","1000"],
    answer: "10000",
    options: ["10000","5000","10001","2000"],
    explanation: "Powers of 10: 10¹, 10², 10³, 10⁴ = 10, 100, 1000, 10000."
  },
  {
    id: "math-negative-countdown",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["3","2","1","0"],
    answer: "-1",
    options: ["-1","-2","00","0.5"],
    explanation: "Counting down by 1: 3, 2, 1, 0, -1."
  },
  {
    id: "math-fractions-halving",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["1","1/2","1/4"],
    answer: "1/8",
    options: ["1/8","1/3","1/6","1/16"],
    explanation: "Each fraction is half the previous: 1 → 1/2 → 1/4 → 1/8."
  },
  {
    id: "math-pi-digits",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["3","1","4","1"],
    answer: "5",
    options: ["5","6","2","9"],
    explanation: "Digits of Pi: 3.1415926... The fifth digit is 5."
  },
  {
    id: "math-double-sequence",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["3","6","12","24"],
    answer: "48",
    options: ["48","36","30","42"],
    explanation: "Each number doubles: 3 × 2 = 6, 6 × 2 = 12, 12 × 2 = 24, 24 × 2 = 48."
  },
  {
    id: "math-multiples-of-seven",
    category: "Math & Numbers",
    difficulty: 1,
    type: "text",
    sequence: ["7","14","21"],
    answer: "28",
    options: ["28","27","35","30"],
    explanation: "Multiples of 7: 7, 14, 21, 28."
  },
  {
    id: "math-fibonacci-extended",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["5","8","13","21"],
    answer: "34",
    options: ["34","29","32","40"],
    explanation: "Fibonacci sequence: each number is the sum of the two before. 13+21=34."
  },
  {
    id: "math-roman-large",
    category: "Math & Numbers",
    difficulty: 3,
    type: "text",
    sequence: ["L","C","D"],
    answer: "M",
    options: ["M","X","E","G"],
    explanation: "Large Roman numerals: L (50), C (100), D (500), M (1000)."
  },
  {
    id: "math-alternating-sign",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["1","-2","3","-4"],
    answer: "5",
    options: ["5","-5","4","6"],
    explanation: "Alternating sign pattern: +1, -2, +3, -4, +5. Absolute values increase, signs alternate."
  },
  {
    id: "math-primes-extended",
    category: "Math & Numbers",
    difficulty: 2,
    type: "text",
    sequence: ["11","13","17","19"],
    answer: "23",
    options: ["23","21","25","27"],
    explanation: "Prime numbers after 10: 11, 13, 17, 19, 23. Each is divisible only by 1 and itself."
  },
  // ─── Logic Sequences ──────────────────────────────
  {
    id: "logic-mirror-letters",
    category: "Logic Sequences",
    difficulty: 3,
    type: "text",
    sequence: ["AZ","BY","CX"],
    answer: "DW",
    options: ["DW","DE","EV","DA"],
    explanation: "First letter goes forward A→B→C→D, second goes backward Z→Y→X→W."
  },
  {
    id: "logic-skip-one-letter",
    category: "Logic Sequences",
    difficulty: 1,
    type: "text",
    sequence: ["A","C","E","G"],
    answer: "I",
    options: ["I","H","J","F"],
    explanation: "Every other letter of the alphabet: A, C, E, G, I (skipping B, D, F, H)."
  },
  {
    id: "logic-double-letters",
    category: "Logic Sequences",
    difficulty: 2,
    type: "text",
    sequence: ["AA","BB","CC"],
    answer: "DD",
    options: ["DD","EE","AB","CD"],
    explanation: "Each letter doubled in alphabetical order: AA → BB → CC → DD."
  },
  {
    id: "logic-reverse-countdown",
    category: "Logic Sequences",
    difficulty: 1,
    type: "text",
    sequence: ["Z","Y","X","W"],
    answer: "V",
    options: ["V","U","A","T"],
    explanation: "Alphabet in reverse: Z → Y → X → W → V."
  },
  {
    id: "logic-shape-sides",
    category: "Logic Sequences",
    difficulty: 1,
    type: "text",
    sequence: ["Triangle","Square","Pentagon"],
    answer: "Hexagon",
    options: ["Hexagon","Circle","Octagon","Rectangle"],
    explanation: "Polygons with increasing sides: Triangle (3) → Square (4) → Pentagon (5) → Hexagon (6)."
  },
  {
    id: "logic-multiply-three",
    category: "Logic Sequences",
    difficulty: 2,
    type: "text",
    sequence: ["2","6","18"],
    answer: "54",
    options: ["54","36","48","72"],
    explanation: "Each number is multiplied by 3: 2 × 3 = 6, 6 × 3 = 18, 18 × 3 = 54."
  },
  {
    id: "logic-add-increasing",
    category: "Logic Sequences",
    difficulty: 2,
    type: "text",
    sequence: ["2","3","5","8"],
    answer: "12",
    options: ["12","11","13","10"],
    explanation: "Add increasing amounts: +1, +2, +3, +4. So 2→3→5→8→12."
  },
  {
    id: "logic-binary-count",
    category: "Logic Sequences",
    difficulty: 3,
    type: "text",
    sequence: ["001","010","011"],
    answer: "100",
    options: ["100","110","101","111"],
    explanation: "Binary counting: 001 (1), 010 (2), 011 (3), 100 (4)."
  },
  {
    id: "logic-vowel-consonant",
    category: "Logic Sequences",
    difficulty: 2,
    type: "text",
    sequence: ["A","B","E","F"],
    answer: "I",
    options: ["I","G","H","J"],
    explanation: "Alternating vowels and consonants (first of each): A, B, E, F, I."
  },
  {
    id: "logic-compound-pattern",
    category: "Logic Sequences",
    difficulty: 3,
    type: "text",
    sequence: ["1A","2B","3C"],
    answer: "4D",
    options: ["4D","5E","3D","4C"],
    explanation: "Numbers increment (1,2,3,4) and letters increment (A,B,C,D): 1A → 2B → 3C → 4D."
  },
  // ─── General Knowledge ────────────────────────────
  {
    id: "gk-days-of-week",
    category: "General Knowledge",
    difficulty: 1,
    type: "text",
    sequence: ["Monday","Tuesday","Wednesday"],
    answer: "Thursday",
    options: ["Thursday","Friday","Sunday","Saturday"],
    explanation: "Days of the week: Monday → Tuesday → Wednesday → Thursday."
  },
  {
    id: "gk-months-year",
    category: "General Knowledge",
    difficulty: 1,
    type: "text",
    sequence: ["January","February","March"],
    answer: "April",
    options: ["April","May","June","December"],
    explanation: "Months in order: January → February → March → April."
  },
  {
    id: "gk-zodiac-signs",
    category: "General Knowledge",
    difficulty: 2,
    type: "text",
    sequence: ["Aries","Taurus","Gemini"],
    answer: "Cancer",
    options: ["Cancer","Leo","Virgo","Pisces"],
    explanation: "Zodiac signs in order: Aries → Taurus → Gemini → Cancer."
  },
  {
    id: "gk-playing-cards",
    category: "General Knowledge",
    difficulty: 1,
    type: "text",
    sequence: ["Jack","Queen","King"],
    answer: "Ace",
    options: ["Ace","Joker","10","2"],
    explanation: "Playing card face values: Jack → Queen → King → Ace."
  },
  {
    id: "gk-decades",
    category: "General Knowledge",
    difficulty: 1,
    type: "text",
    sequence: ["1980s","1990s","2000s"],
    answer: "2010s",
    options: ["2010s","2020s","1970s","2050s"],
    explanation: "Consecutive decades: 1980s → 1990s → 2000s → 2010s."
  },
  {
    id: "gk-life-stages",
    category: "General Knowledge",
    difficulty: 1,
    type: "emoji",
    sequence: ["👶","🧒","🧑"],
    answer: "🧓",
    options: ["🧓","👶","🧒","🦴"],
    explanation: "Human life stages: baby → child → adult → elderly."
  },
  {
    id: "gk-meal-times",
    category: "General Knowledge",
    difficulty: 1,
    type: "text",
    sequence: ["Breakfast","Lunch"],
    answer: "Dinner",
    options: ["Dinner","Brunch","Snack","Midnight Feast"],
    explanation: "Daily meals in order: Breakfast → Lunch → Dinner."
  },
  {
    id: "gk-education-levels",
    category: "General Knowledge",
    difficulty: 1,
    type: "text",
    sequence: ["Elementary","Middle School","High School"],
    answer: "College",
    options: ["College","Preschool","Daycare","Kindergarten"],
    explanation: "Education progression: Elementary → Middle School → High School → College."
  },
  {
    id: "gk-time-units",
    category: "General Knowledge",
    difficulty: 1,
    type: "text",
    sequence: ["Second","Minute","Hour"],
    answer: "Day",
    options: ["Day","Week","Month","Millisecond"],
    explanation: "Time units from smallest to largest: Second → Minute → Hour → Day."
  },
  {
    id: "gk-counting-fingers",
    category: "General Knowledge",
    difficulty: 1,
    type: "emoji",
    sequence: ["☝️","✌️","🤟","🖖"],
    answer: "🖐️",
    options: ["🖐️","👊","👋","👍"],
    explanation: "Counting on fingers: one ☝️ → two ✌️ → three 🤟 → four 🖖 → five (open hand) 🖐️."
  },
  // ─── Emoji Sequences ──────────────────────────────
  {
    id: "emoji-morning-routine",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["⏰","🚿","👔"],
    answer: "🚗",
    options: ["🚗","😴","🍳","🛏️"],
    explanation: "Morning routine: alarm → shower → get dressed → drive to work."
  },
  {
    id: "emoji-cooking-process",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🛒","🔪","🍳"],
    answer: "🍽️",
    options: ["🍽️","🗑️","🛒","🔥"],
    explanation: "Cooking process: shop → chop → cook → serve/eat."
  },
  {
    id: "emoji-plant-growth",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌧️","🌱","🌿"],
    answer: "🌻",
    options: ["🌻","🍂","🌵","🪨"],
    explanation: "Plant growth: rain → sprout → leaves → flower."
  },
  {
    id: "emoji-space-journey",
    category: "Emoji Sequences",
    difficulty: 2,
    type: "emoji",
    sequence: ["🌍","🚀","🌙"],
    answer: "⭐",
    options: ["⭐","🌍","☀️","🛸"],
    explanation: "Space journey: Earth → launch → Moon → stars (going further into space)."
  },
  {
    id: "emoji-weather-day",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌅","☀️","🌤️"],
    answer: "🌆",
    options: ["🌆","🌃","⛈️","🌅"],
    explanation: "A day's weather: sunrise → sunny → partly cloudy → sunset."
  },
  {
    id: "emoji-birthday-party",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🎈","🎂","🕯️"],
    answer: "🎉",
    options: ["🎉","😢","🎈","🍕"],
    explanation: "Birthday party: balloons → cake → blow candles → celebration!"
  },
  {
    id: "emoji-movie-night",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🎬","🍿","📺"],
    answer: "😴",
    options: ["😴","🎮","📖","🎬"],
    explanation: "Movie night: pick a movie → popcorn → watch → fall asleep."
  },
  {
    id: "emoji-workout",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🏋️","🏃","💦"],
    answer: "💪",
    options: ["💪","🍕","😴","🛋️"],
    explanation: "Workout routine: lift weights → run → sweat → get strong!"
  },
  {
    id: "emoji-rainy-day",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["☁️","🌧️","☂️"],
    answer: "🌈",
    options: ["🌈","⛈️","❄️","☁️"],
    explanation: "Rainy day sequence: clouds → rain → umbrella → rainbow appears after."
  },
  // ─── Colors & Patterns ────────────────────────────
  {
    id: "color-traffic-light",
    category: "Colors & Patterns",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴","🟡"],
    answer: "🟢",
    options: ["🟢","🔵","🟠","⚫"],
    explanation: "Traffic light sequence: Red (stop) → Yellow (caution) → Green (go)."
  },
  {
    id: "color-mixing-primary",
    category: "Colors & Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["Red + Blue = Purple","Red + Yellow = Orange"],
    answer: "Blue + Yellow = Green",
    options: ["Blue + Yellow = Green","Red + Green = Brown","Blue + Red = Pink","Yellow + Green = Lime"],
    explanation: "Primary color mixing: Red+Blue=Purple, Red+Yellow=Orange, Blue+Yellow=Green."
  },
  {
    id: "color-greyscale",
    category: "Colors & Patterns",
    difficulty: 1,
    type: "emoji",
    sequence: ["⬛","🩶"],
    answer: "⬜",
    options: ["⬜","🟦","🟥","🟫"],
    explanation: "Greyscale from dark to light: Black → Grey → White."
  },
  {
    id: "color-complementary",
    category: "Colors & Patterns",
    difficulty: 3,
    type: "text",
    sequence: ["Red↔Green","Blue↔Orange"],
    answer: "Yellow↔Purple",
    options: ["Yellow↔Purple","Red↔Blue","Green↔Orange","White↔Black"],
    explanation: "Complementary color pairs: Red↔Green, Blue↔Orange, Yellow↔Purple."
  },
  {
    id: "color-pattern-repeat",
    category: "Colors & Patterns",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔴","🔵","🔴","🔵"],
    answer: "🔴",
    options: ["🔴","🔵","🟡","🟢"],
    explanation: "Simple alternating pattern: Red, Blue, Red, Blue, Red..."
  },
  {
    id: "color-pattern-triple",
    category: "Colors & Patterns",
    difficulty: 2,
    type: "emoji",
    sequence: ["🔴","🟡","🔵","🔴","🟡"],
    answer: "🔵",
    options: ["🔵","🔴","🟡","🟢"],
    explanation: "Repeating pattern of three: Red, Yellow, Blue, Red, Yellow, Blue..."
  },
  // ─── Creative & Mixed ─────────────────────────────
  {
    id: "creative-story-arc",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "text",
    sequence: ["Setup","Conflict","Climax"],
    answer: "Resolution",
    options: ["Resolution","Sequel","Prologue","Epilogue"],
    explanation: "Classic story structure: Setup → Conflict → Climax → Resolution."
  },
  {
    id: "creative-art-supplies",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["✏️","🖍️","🖌️"],
    answer: "🎨",
    options: ["🎨","📏","✂️","📐"],
    explanation: "Art supplies progression: pencil sketch → crayon color → paint brush → palette (masterpiece)."
  },
  {
    id: "creative-emotions-positive",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["😐","🙂","😊"],
    answer: "😄",
    options: ["😄","😢","😡","😐"],
    explanation: "Increasing happiness: neutral → slightly happy → happy → very happy."
  },
  {
    id: "creative-seasons-activities",
    category: "Creative & Mixed",
    difficulty: 1,
    type: "emoji",
    sequence: ["🌷","🏖️","🍁"],
    answer: "⛷️",
    options: ["⛷️","🎄","🌸","🏊"],
    explanation: "Seasonal activities: spring flowers → summer beach → fall leaves → winter skiing."
  },
  {
    id: "creative-house-building",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["📐","🧱","🪵"],
    answer: "🏠",
    options: ["🏠","🏗️","🔨","🧰"],
    explanation: "Building a house: blueprint → bricks → wood framing → finished house."
  },
  {
    id: "creative-dream-to-reality",
    category: "Creative & Mixed",
    difficulty: 2,
    type: "emoji",
    sequence: ["💡","📝","🔨"],
    answer: "🏆",
    options: ["🏆","💤","💡","❌"],
    explanation: "From idea to achievement: idea → plan → build → success."
  },
  // ─── Flags ────────────────────────────────────────
  {
    id: "flag-nordic-countries",
    category: "Flags",
    difficulty: 2,
    type: "emoji",
    sequence: ["🇳🇴","🇸🇪","🇩🇰"],
    answer: "🇫🇮",
    options: ["🇫🇮","🇩🇪","🇵🇱","🇳🇱"],
    explanation: "Nordic countries: Norway → Sweden → Denmark → Finland."
  },
  {
    id: "flag-english-speaking",
    category: "Flags",
    difficulty: 1,
    type: "emoji",
    sequence: ["🇺🇸","🇬🇧","🇦🇺"],
    answer: "🇨🇦",
    options: ["🇨🇦","🇫🇷","🇩🇪","🇯🇵"],
    explanation: "Major English-speaking countries: USA → UK → Australia → Canada."
  },
  {
    id: "flag-brics-nations",
    category: "Flags",
    difficulty: 3,
    type: "emoji",
    sequence: ["🇧🇷","🇷🇺","🇮🇳"],
    answer: "🇨🇳",
    options: ["🇨🇳","🇯🇵","🇰🇷","🇲🇽"],
    explanation: "BRICS nations: Brazil → Russia → India → China → South Africa."
  },
  {
    id: "flag-southeast-asia",
    category: "Flags",
    difficulty: 3,
    type: "emoji",
    sequence: ["🇹🇭","🇻🇳","🇲🇾"],
    answer: "🇸🇬",
    options: ["🇸🇬","🇨🇳","🇯🇵","🇰🇷"],
    explanation: "Southeast Asian nations: Thailand → Vietnam → Malaysia → Singapore."
  },
  {
    id: "flag-south-american",
    category: "Flags",
    difficulty: 2,
    type: "emoji",
    sequence: ["🇧🇷","🇦🇷","🇨🇱"],
    answer: "🇨🇴",
    options: ["🇨🇴","🇲🇽","🇪🇸","🇵🇹"],
    explanation: "South American countries by population: Brazil → Argentina → Chile → Colombia."
  },
  // ─── Pop Culture ──────────────────────────────────
  {
    id: "pop-movie-ratings",
    category: "Pop Culture",
    difficulty: 1,
    type: "text",
    sequence: ["G","PG","PG-13"],
    answer: "R",
    options: ["R","NC-17","X","AA"],
    explanation: "US movie ratings from least to most restrictive: G → PG → PG-13 → R."
  },
  {
    id: "pop-social-media-actions",
    category: "Pop Culture",
    difficulty: 1,
    type: "emoji",
    sequence: ["📸","❤️","💬"],
    answer: "🔄",
    options: ["🔄","🗑️","📵","🔇"],
    explanation: "Social media engagement: post photo → like → comment → share/repost."
  },
  {
    id: "pop-gaming-levels",
    category: "Pop Culture",
    difficulty: 1,
    type: "emoji",
    sequence: ["🟢","🟡","🟠"],
    answer: "🔴",
    options: ["🔴","🟣","⚫","⚪"],
    explanation: "Game difficulty levels: Easy (green) → Medium (yellow) → Hard (orange) → Expert (red)."
  },
  {
    id: "pop-streaming-evolution",
    category: "Pop Culture",
    difficulty: 2,
    type: "text",
    sequence: ["VHS","DVD","Blu-ray"],
    answer: "Streaming",
    options: ["Streaming","Betamax","LaserDisc","Film Reel"],
    explanation: "Home entertainment evolution: VHS → DVD → Blu-ray → Streaming."
  },
  {
    id: "pop-phone-evolution",
    category: "Pop Culture",
    difficulty: 1,
    type: "emoji",
    sequence: ["☎️","📟","📱"],
    answer: "⌚",
    options: ["⌚","📞","📺","💻"],
    explanation: "Personal communication devices: rotary phone → pager → smartphone → smartwatch."
  },
  // ─── Visual & Spatial ─────────────────────────────
  {
    id: "visual-symmetry-shapes",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "text",
    sequence: ["▲","■","⬠"],
    answer: "⬡",
    options: ["⬡","●","★","◆"],
    explanation: "Shapes with increasing sides: triangle (3) → square (4) → pentagon (5) → hexagon (6)."
  },
  {
    id: "visual-arrow-rotation",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "text",
    sequence: ["→","↓","←"],
    answer: "↑",
    options: ["↑","↗","↙","⟳"],
    explanation: "Arrow rotating 90° clockwise: right → down → left → up."
  },
  {
    id: "visual-growing-dots",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "text",
    sequence: ["·","··","···"],
    answer: "····",
    options: ["····","·····","··","·"],
    explanation: "Adding one dot each time: 1 dot, 2 dots, 3 dots, 4 dots."
  },
  {
    id: "visual-nesting-brackets",
    category: "Visual & Spatial",
    difficulty: 2,
    type: "text",
    sequence: ["()","(())","((()))"],
    answer: "(((())))",
    options: ["(((())))","()()","((()))","(()())"],
    explanation: "Each step adds another layer of nesting: () → (()) → ((())) → (((())))"
  },
  {
    id: "visual-size-emoji",
    category: "Visual & Spatial",
    difficulty: 1,
    type: "emoji",
    sequence: ["🔹","🔷","💎"],
    answer: "💠",
    options: ["💠","🔸","🔹","⬛"],
    explanation: "Diamond shapes getting larger: small diamond → medium diamond → gem → large diamond."
  },
  // ─── Letter & Word Patterns ───────────────────────
  {
    id: "letter-alphabet-groups",
    category: "Letter & Word Patterns",
    difficulty: 1,
    type: "text",
    sequence: ["ABC","DEF","GHI"],
    answer: "JKL",
    options: ["JKL","KLM","HIJ","MNO"],
    explanation: "Alphabet in groups of 3: ABC, DEF, GHI, JKL."
  },
  {
    id: "letter-word-length",
    category: "Letter & Word Patterns",
    difficulty: 1,
    type: "text",
    sequence: ["I","am","the"],
    answer: "best",
    options: ["best","go","a","me"],
    explanation: "Words with increasing letter count: I (1) → am (2) → the (3) → best (4)."
  },
  {
    id: "letter-palindrome-growth",
    category: "Letter & Word Patterns",
    difficulty: 3,
    type: "text",
    sequence: ["a","aba","abcba"],
    answer: "abcdcba",
    options: ["abcdcba","abcba","abcabc","aabbcc"],
    explanation: "Growing palindromes: a → aba → abcba → abcdcba. Each adds a new letter in the center."
  },
  {
    id: "letter-consonant-sequence",
    category: "Letter & Word Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["B","C","D","F"],
    answer: "G",
    options: ["G","E","H","J"],
    explanation: "Consonants in order, skipping vowels: B, C, D, F, G."
  },
  {
    id: "letter-double-word",
    category: "Letter & Word Patterns",
    difficulty: 2,
    type: "text",
    sequence: ["AA","BB","CC","DD"],
    answer: "EE",
    options: ["EE","FF","AB","DE"],
    explanation: "Double-letter pairs in alphabetical order: AA → BB → CC → DD → EE."
  },
  // ─── Geography ────────────────────────────────────
  {
    id: "geo-time-zones",
    category: "Geography",
    difficulty: 2,
    type: "text",
    sequence: ["UTC-5 (New York)","UTC+0 (London)","UTC+3 (Moscow)"],
    answer: "UTC+8 (Beijing)",
    options: ["UTC+8 (Beijing)","UTC-8 (LA)","UTC+1 (Paris)","UTC+12 (Auckland)"],
    explanation: "Major cities moving east through time zones: New York → London → Moscow → Beijing."
  },
  // ─── History ──────────────────────────────────────
  {
    id: "hist-industrial-inventions",
    category: "History",
    difficulty: 2,
    type: "text",
    sequence: ["Steam Engine","Telegraph","Telephone"],
    answer: "Radio",
    options: ["Radio","Wheel","Printing Press","Compass"],
    explanation: "Major inventions of the industrial era: Steam Engine → Telegraph → Telephone → Radio."
  },
  // ─── Technology ───────────────────────────────────
  {
    id: "tech-coding-concepts",
    category: "Technology",
    difficulty: 3,
    type: "text",
    sequence: ["Variable","Function","Class"],
    answer: "Module",
    options: ["Module","Bit","Pixel","Wire"],
    explanation: "Programming concepts by abstraction level: Variable → Function → Class → Module."
  },
  // ─── Science ──────────────────────────────────────
  {
    id: "sci-planet-types",
    category: "Science",
    difficulty: 2,
    type: "text",
    sequence: ["Mercury (rocky)","Jupiter (gas giant)","Uranus (ice giant)"],
    answer: "Sun (star)",
    options: ["Sun (star)","Moon (satellite)","Pluto (dwarf)","Ceres (asteroid)"],
    explanation: "Celestial body types by size: rocky planet → gas giant → ice giant → star."
  },
  // ─── General Knowledge ────────────────────────────
  {
    id: "gk-coin-values",
    category: "General Knowledge",
    difficulty: 1,
    type: "text",
    sequence: ["Penny","Nickel","Dime"],
    answer: "Quarter",
    options: ["Quarter","Dollar","Half Dollar","Cent"],
    explanation: "US coins by value: Penny (1¢) → Nickel (5¢) → Dime (10¢) → Quarter (25¢)."
  },
  // ─── Emoji Sequences ──────────────────────────────
  {
    id: "emoji-bedtime-routine",
    category: "Emoji Sequences",
    difficulty: 1,
    type: "emoji",
    sequence: ["🦷","📖","🛏️"],
    answer: "😴",
    options: ["😴","☀️","🏃","📱"],
    explanation: "Bedtime routine: brush teeth → read a book → get in bed → sleep."
  },
  // ─── Music ────────────────────────────────────────
  {
    id: "music-tempo-terms",
    category: "Music",
    difficulty: 3,
    type: "text",
    sequence: ["Largo","Adagio","Andante"],
    answer: "Allegro",
    options: ["Allegro","Presto","Forte","Piano"],
    explanation: "Musical tempo markings from slow to fast: Largo → Adagio → Andante → Allegro."
  },
];