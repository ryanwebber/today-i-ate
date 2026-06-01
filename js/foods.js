// Curated list of common digestive triggers and allergens.
// Grouped by category. Each entry: { id, name, category }.
// IDs are stable strings — used as storage keys; never change them.

window.FOODS = (function () {
  const categories = [
    {
      id: "dairy",
      label: "Dairy",
      items: [
        ["milk", "Milk"],
        ["cream", "Cream / half-and-half"],
        ["butter", "Butter"],
        ["hard_cheese", "Hard cheese"],
        ["soft_cheese", "Soft cheese"],
        ["yogurt", "Yogurt"],
        ["ice_cream", "Ice cream"],
        ["whey", "Whey / protein powder"],
        ["lactose_free_milk", "Lactose-free milk"],
        ["cottage_cheese", "Cottage cheese"],
      ],
    },
    {
      id: "grains",
      label: "Grains",
      items: [
        ["wheat_bread", "Wheat bread"],
        ["pasta", "Pasta"],
        ["pizza", "Pizza"],
        ["crackers", "Crackers"],
        ["cereal", "Breakfast cereal"],
        ["oats", "Oats"],
        ["rice", "Rice"],
        ["quinoa", "Quinoa"],
        ["corn", "Corn / cornmeal"],
        ["rye", "Rye"],
      ],
    },
    {
      id: "legumes",
      label: "Legumes",
      items: [
        ["black_beans", "Black beans"],
        ["kidney_beans", "Kidney beans"],
        ["chickpeas", "Chickpeas"],
        ["lentils", "Lentils"],
        ["peanuts", "Peanuts"],
        ["soy_tofu", "Soy / tofu"],
        ["edamame", "Edamame"],
        ["hummus", "Hummus"],
      ],
    },
    {
      id: "tree_nuts",
      label: "Tree nuts",
      items: [
        ["almonds", "Almonds"],
        ["cashews", "Cashews"],
        ["walnuts", "Walnuts"],
        ["pecans", "Pecans"],
        ["pistachios", "Pistachios"],
        ["hazelnuts", "Hazelnuts"],
        ["brazil_nuts", "Brazil nuts"],
        ["macadamia", "Macadamia"],
      ],
    },
    {
      id: "seafood",
      label: "Fish & shellfish",
      items: [
        ["salmon", "Salmon"],
        ["tuna", "Tuna"],
        ["white_fish", "White fish"],
        ["shrimp", "Shrimp"],
        ["lobster_crab", "Lobster / crab"],
        ["clams_mussels", "Clams / mussels"],
        ["oysters", "Oysters"],
        ["anchovies", "Anchovies"],
      ],
    },
    {
      id: "meat",
      label: "Meat",
      items: [
        ["chicken", "Chicken"],
        ["beef", "Beef"],
        ["pork", "Pork"],
        ["bacon", "Bacon"],
        ["sausage", "Sausage"],
        ["cured_meats", "Cured / deli meats"],
        ["lamb", "Lamb"],
        ["turkey", "Turkey"],
      ],
    },
    {
      id: "eggs",
      label: "Eggs",
      items: [["eggs", "Eggs"]],
    },
    {
      id: "fodmap_veg",
      label: "High-FODMAP vegetables",
      items: [
        ["onion", "Onion"],
        ["garlic", "Garlic"],
        ["shallot", "Shallot"],
        ["leek", "Leek"],
        ["asparagus", "Asparagus"],
        ["mushrooms", "Mushrooms"],
        ["cauliflower", "Cauliflower"],
        ["cabbage", "Cabbage"],
        ["broccoli", "Broccoli"],
        ["brussels_sprouts", "Brussels sprouts"],
      ],
    },
    {
      id: "veg",
      label: "Other vegetables",
      items: [
        ["tomato", "Tomato"],
        ["bell_pepper", "Bell pepper"],
        ["spinach", "Spinach"],
        ["lettuce", "Lettuce"],
        ["cucumber", "Cucumber"],
        ["carrot", "Carrot"],
        ["zucchini", "Zucchini"],
        ["potato", "Potato"],
      ],
    },
    {
      id: "fruit",
      label: "Fruit",
      items: [
        ["apple", "Apple"],
        ["pear", "Pear"],
        ["mango", "Mango"],
        ["watermelon", "Watermelon"],
        ["grapes", "Grapes"],
        ["stone_fruit", "Stone fruit (peach, plum, etc.)"],
        ["banana", "Banana"],
        ["berries", "Berries"],
        ["citrus", "Citrus"],
        ["dried_fruit", "Dried fruit"],
      ],
    },
    {
      id: "sweeteners",
      label: "Sweeteners & sweets",
      items: [
        ["honey", "Honey"],
        ["agave", "Agave"],
        ["sugar", "Table sugar"],
        ["sugar_alcohols", "Sugar alcohols (sorbitol, xylitol)"],
        ["hfcs", "High-fructose corn syrup"],
        ["chocolate", "Chocolate"],
      ],
    },
    {
      id: "beverages",
      label: "Beverages",
      items: [
        ["coffee", "Coffee"],
        ["tea_caf", "Tea (caffeinated)"],
        ["tea_herbal", "Tea (herbal)"],
        ["beer", "Beer"],
        ["wine", "Wine"],
        ["spirits", "Spirits"],
        ["soda", "Soda"],
        ["fruit_juice", "Fruit juice"],
      ],
    },
    {
      id: "condiments",
      label: "Condiments",
      items: [
        ["soy_sauce", "Soy sauce"],
        ["vinegar", "Vinegar"],
        ["spicy", "Hot sauce / spicy food"],
        ["mustard", "Mustard"],
        ["mayo", "Mayonnaise"],
        ["ketchup", "Ketchup"],
      ],
    },
    {
      id: "other",
      label: "Other",
      items: [
        ["sesame", "Sesame"],
        ["avocado", "Avocado"],
        ["coconut", "Coconut"],
        ["olives", "Olives"],
        ["fermented", "Fermented / pickled foods"],
      ],
    },
  ];

  const all = [];
  const byId = {};
  for (const cat of categories) {
    for (const [id, name] of cat.items) {
      const entry = { id, name, category: cat.id, categoryLabel: cat.label };
      all.push(entry);
      byId[id] = entry;
    }
  }

  return {
    categories: categories.map((c) => ({ id: c.id, label: c.label })),
    all,
    byId,

    // Resolves a food ID (built-in or custom) to a display object.
    // `customFoods` is the list from storage.
    resolve(id, customFoods) {
      if (byId[id]) return byId[id];
      if (customFoods) {
        const found = customFoods.find((f) => f.id === id);
        if (found) return found;
      }
      return { id, name: id, category: "unknown", categoryLabel: "Unknown" };
    },
  };
})();
