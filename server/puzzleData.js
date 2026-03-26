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
];
