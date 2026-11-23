// The menu as printed on the restaurant's menu card. The site's dishes and prices come from the POS storefront API
// (src/lib/menu.ts); this file only supplies descriptions for POS dishes that have none, matched by name.
// Prices are in AUD. A dish with sizes shows "From" its cheapest. `veg` on a section applies to every dish in it
// unless the dish sets its own; a wrong "Veg" tag is a dietary risk, so check it whenever a dish is added.
// `estimate: true` marks a price we set from typical Sydney prices because the restaurant has not confirmed one yet.
export interface MenuDish {
  name: string;
  desc?: string;
  price?: number;
  /** Size or style choices with their prices, e.g. Half and Full. */
  sizes?: [string, number][];
  /** Choices that do not change the price, shown as a tag. */
  options?: string[];
  veg?: boolean;
  estimate?: boolean;
}

export interface MenuSection {
  title: string;
  /** One line under the section title. */
  deck: string;
  veg: boolean;
  dishes: MenuDish[];
}

export const menu: MenuSection[] = [
  {
    title: "Chaats",
    deck: "Street food from the lanes around the Golden Temple: crisp, tangy, sweet and cold all in one bite.",
    veg: true,
    dishes: [
      { name: "Pani Puri", desc: "Six crisp hollow puris filled with spiced potato and chickpeas, served with tangy mint and tamarind water.", price: 8.99, options: ["6 pcs"] },
      { name: "Papdi Chaat", desc: "Crisp wheat crackers topped with potato, chickpeas, yoghurt, tamarind and mint chutneys.", price: 10.99 },
      { name: "Sweet Potato Chaat", desc: "Roasted sweet potato tossed with chaat masala, lemon and tangy chutneys.", price: 10.99 },
      { name: "Dahi Puri", desc: "Crisp puris stuffed with potato and topped with sweetened yoghurt, chutneys and sev.", price: 10.99 },
      { name: "Samosa Chaat", desc: "Crushed samosa over spiced chickpeas, finished with yoghurt, chutneys and sev.", price: 10.99 },
      { name: "Dahi Bhalla", desc: "Soft lentil dumplings soaked in creamy yoghurt with tamarind and mint chutneys.", price: 12.99 },
      { name: "Bhalla Papdi Chaat", desc: "Lentil dumplings and crisp papdi layered with yoghurt, chutneys and spices.", price: 12.99 },
      { name: "Samosa", desc: "A crisp pastry filled with spiced potato and peas, served with chutney.", price: 5.99 },
      { name: "Aloo Tikki Chaat", desc: "Crisp potato patties topped with spiced chickpeas, yoghurt and chutneys.", price: 10.99 },
    ],
  },
  {
    title: "Vegetarian Entrées",
    deck: "Paneer and soya chap, marinated and kissed by the tandoor's fire.",
    veg: true,
    dishes: [
      { name: "Tandoori Paneer Tikka", desc: "Paneer cubes marinated in yoghurt and tandoori spices, char-grilled with capsicum and onion.", price: 16.99 },
      { name: "Malai Paneer Tikka", desc: "Paneer in a mild cream, cheese and cardamom marinade, grilled in the tandoor.", price: 16.99 },
      { name: "Achari Paneer Tikka", desc: "Paneer in a tangy pickle-spice marinade, char-grilled in the tandoor.", price: 16.99 },
      { name: "Mushroom Tikka", desc: "Button mushrooms marinated in yoghurt and tandoori spices, grilled in the tandoor.", price: 16.99 },
      { name: "Tandoori Soya Chap Tikka", desc: "Soya chaap marinated in tandoori spices and yoghurt, char-grilled on skewers.", price: 16.99 },
      { name: "Malai Soya Chap", desc: "Soya chaap in a mild creamy malai marinade, served dry from the tandoor or in gravy.", price: 17.99, options: ["Dry", "Gravy"] },
      { name: "Achari Soya Chap", desc: "Soya chaap in a tangy pickle-spice marinade, grilled in the tandoor.", price: 16.99 },
      { name: "Anjeer Paneer Tikka", desc: "Paneer filled with a sweet fig stuffing in a creamy marinade, grilled in the tandoor.", price: 17.99 },
    ],
  },
  {
    title: "Momos",
    deck: "Hand-folded dumplings, steamed, fried or tossed in the wok.",
    veg: true,
    dishes: [
      { name: "Veg Momo", desc: "Vegetable-filled dumplings, served with a spicy tomato chutney.", sizes: [["Steam or fried", 12.99], ["Chilli, jhol or tandoori", 14.99]] },
      { name: "Chicken Momo", desc: "Minced chicken dumplings, served with a spicy tomato chutney.", sizes: [["Steam or fried", 13.99], ["Chilli, jhol or tandoori", 15.99]], veg: false },
    ],
  },
  {
    title: "Indo-Chinese Vegetarian",
    deck: "The wok-tossed food every Punjabi grows up craving: hot, glossy and loud with garlic.",
    veg: true,
    dishes: [
      { name: "Veg Noodles", desc: "Wok-tossed noodles with vegetables: plain, chilli garlic or in Schezwan sauce.", price: 16.99, options: ["Plain", "Chilli garlic", "Schezwan"] },
      { name: "Chilli Paneer", desc: "Crisp paneer tossed with capsicum, onion, green chilli and soy sauce.", price: 16.99 },
      { name: "Chilli Mushroom", desc: "Crisp mushrooms tossed with capsicum, onion, green chilli and soy sauce.", price: 16.99 },
      { name: "Chilli Gobhi", desc: "Crisp cauliflower tossed with capsicum, onion, green chilli and soy sauce.", price: 16.99 },
      { name: "Paneer 65", desc: "Spicy fried paneer tempered with curry leaves, chilli and garlic.", price: 16.99 },
      { name: "Soya Chap 65", desc: "Spicy fried soya chaap tempered with curry leaves, chilli and garlic.", price: 16.99, options: ["Classic", "Schezwan"] },
      { name: "Veg Manchurian", desc: "Fried mixed vegetable balls in a garlic, ginger and soy Manchurian sauce.", price: 16.99 },
      { name: "Gobhi Manchurian", desc: "Crisp cauliflower florets tossed in a tangy garlic and soy Manchurian sauce.", price: 16.99 },
      { name: "Honey Chilli Potato", desc: "Crisp potato fingers glazed in a sweet and spicy honey chilli sauce with sesame.", price: 16.99 },
    ],
  },
  {
    title: "Indo-Chinese Non-Vegetarian",
    deck: "Chicken from the wok, with all the fire.",
    veg: false,
    dishes: [
      { name: "Chicken Noodles", desc: "Wok-tossed noodles with chicken and vegetables: plain, with egg or in Schezwan sauce.", price: 18.99, options: ["Plain", "Egg", "Schezwan"] },
      { name: "Chilli Chicken", desc: "Crisp chicken tossed with capsicum, onion, green chilli and soy sauce.", price: 18.99 },
      { name: "Chilli Chicken (Dry)", desc: "Crisp chicken tossed dry with capsicum, onion, green chilli and soy, without the sauce.", price: 18.99, estimate: true },
    ],
  },
  {
    title: "Non-Vegetarian Entrées",
    deck: "Kebabs and tikkas straight off the skewer, smoky and still sizzling.",
    veg: false,
    dishes: [
      { name: "Tandoori Chicken Tikka", desc: "Boneless chicken marinated in yoghurt and tandoori spices, char-grilled in the tandoor.", sizes: [["Half", 16.99], ["Full", 22.99]] },
      { name: "Tandoori Chicken", desc: "Chicken on the bone marinated in yoghurt and tandoori spices, roasted in the clay oven.", sizes: [["Half", 16.99], ["Full", 22.99]] },
      { name: "Tandoori Lamb Cutlets", desc: "Four lamb cutlets marinated in ginger, garlic and tandoori spices, char-grilled in the tandoor.", price: 24.99, options: ["4 pcs"] },
      { name: "Malai Chicken Tikka", desc: "Boneless chicken in a mild cream, cheese and cardamom marinade, grilled in the tandoor.", price: 18.99 },
      { name: "Seekh Kabab", desc: "Spiced lamb or chicken mince moulded on skewers and grilled in the tandoor.", price: 18.99, options: ["Lamb", "Chicken"] },
      { name: "Chapli Kabab", desc: "Flat Peshawari-style minced meat patties with crushed coriander, chilli and herbs.", price: 20.99 },
      { name: "Tangri Kabab", desc: "Chicken drumsticks marinated in yoghurt and spices, roasted in the tandoor.", price: 20.99 },
      { name: "Blanket Kabab", desc: "Lamb or chicken seekh kabab wrapped in a soft blanket layer and finished on the grill.", price: 20.99, options: ["Lamb", "Chicken"] },
    ],
  },
  {
    title: "Seafood Entrées",
    deck: "Fish and prawns, Amritsar's other great love.",
    veg: false,
    dishes: [
      { name: "Tandoori Fish", desc: "Fish marinated in yoghurt, carom seeds and tandoori spices, roasted in the tandoor.", price: 20.99 },
      { name: "Tandoori Fish Tikka", desc: "Boneless fish pieces in a tandoori spice marinade, char-grilled on skewers.", price: 20.99 },
      { name: "Tandoori Prawn", desc: "Prawns marinated in yoghurt and tandoori spices, grilled in the tandoor.", price: 20.99 },
      { name: "Amritsari Fish", desc: "Fish fillets in a carom-seed spiced gram flour batter, fried crisp Amritsar style.", price: 20.99 },
      { name: "Butter Garlic Prawn", desc: "Prawns sautéed in butter with plenty of garlic, pepper and herbs.", price: 20.99 },
    ],
  },
  {
    title: "Vegetarian Mains",
    deck: "Slow pots, butter and lentils: the heart of a Punjabi table.",
    veg: true,
    dishes: [
      { name: "Dal Makhni", desc: "Black lentils and kidney beans slow-cooked overnight with butter and cream.", price: 18.99 },
      { name: "Dal Tadka", desc: "Yellow lentils tempered with cumin, garlic, tomato and ghee.", price: 18.99 },
      { name: "Paneer Tikka Butter Masala", desc: "Tandoor-grilled paneer tikka in a rich buttery tomato gravy.", price: 20.99 },
      { name: "Kadai Paneer", desc: "Paneer cooked with capsicum, onion and freshly ground kadai spices.", price: 20.99 },
      { name: "Shahi Paneer", desc: "Paneer in a creamy, mildly sweet tomato and cashew gravy.", price: 20.99 },
      { name: "Paneer Bhurji", desc: "Scrambled paneer cooked with onion, tomato, green chilli and spices.", price: 20.99 },
      { name: "Malai Kofta", desc: "Paneer and potato dumplings in a smooth, creamy cashew gravy.", price: 20.99 },
      { name: "Palak Paneer", desc: "Paneer cubes in a spiced spinach purée finished with cream.", price: 20.99 },
      { name: "Sarson Ka Saag", desc: "Slow-cooked mustard greens with ginger and garlic, finished with white butter.", price: 18.99, options: ["Amritsari special"] },
      { name: "Amritsari Chole", desc: "Dark, tangy Amritsari-style chickpeas cooked with whole spices.", price: 18.99 },
      { name: "Soya Chap Masala", desc: "Soya chaap simmered in a spiced onion and tomato masala.", price: 20.99 },
    ],
  },
  {
    title: "Non-Vegetarian Mains",
    deck: "The curries people cross the city for.",
    veg: false,
    dishes: [
      { name: "Butter Chicken", desc: "Tandoori chicken, on the bone or boneless, in a creamy buttery tomato gravy.", price: 22.99, options: ["With bone", "Boneless"] },
      { name: "Chicken Tikka Masala", desc: "Char-grilled chicken tikka in a spiced onion-tomato masala.", price: 22.99 },
      { name: "Kadahi Chicken", desc: "Chicken cooked with capsicum, onion and freshly ground kadai spices.", price: 22.99 },
      { name: "Rara Chicken", desc: "Chicken pieces cooked in a thick, spicy gravy with chicken mince.", price: 22.99 },
      { name: "Goat Masala", desc: "Goat on the bone slow-cooked in a thick onion-tomato masala.", price: 25.99 },
    ],
  },
  {
    title: "Amritsari Specials",
    deck: "The dishes we are named for, cooked the way they are in Amritsar.",
    veg: false,
    dishes: [
      { name: "Haddi Wala Murga", desc: "Home-style chicken curry cooked on the bone, slow and rich, the way Amritsari dhabas make it.", price: 25.99 },
      { name: "Kali Mirch Chicken", desc: "Chicken in a creamy gravy flavoured with crushed black pepper.", price: 22.99 },
      { name: "Egg Bhurji", desc: "Spiced scrambled eggs with onion, tomato and green chilli.", price: 22.99 },
      { name: "Amritsari Special Kulcha", desc: "Our crisp, butter-topped stuffed kulcha with Amritsari chole, chutney and pickled onion.", price: 16.99, veg: true },
      { name: "Amritsari Special Chole Bhature", desc: "Fluffy fried bhature served with tangy Amritsari-style chickpeas.", price: 16.99, veg: true },
    ],
  },
  {
    title: "Breads",
    deck: "Slapped against the clay wall of the tandoor and brought to the table blistered and hot.",
    veg: true,
    dishes: [
      { name: "Plain Roti", desc: "Wholemeal flatbread baked in the tandoor.", price: 3.99 },
      { name: "Plain Naan", desc: "Soft leavened flatbread baked in the tandoor.", price: 4.99 },
      { name: "Butter Naan", desc: "Soft tandoor-baked naan brushed with butter.", price: 5.99 },
      { name: "Garlic Naan", desc: "Naan topped with chopped garlic and coriander.", price: 5.99 },
      { name: "Cheese Naan", desc: "Naan stuffed with melted cheese.", price: 7.99 },
      { name: "Cheese Garlic Naan", desc: "Cheese-stuffed naan topped with garlic.", price: 8.99 },
      { name: "Cheese Chilli Naan", desc: "Cheese-stuffed naan with green chilli.", price: 8.99 },
      { name: "Plain Lacha Paratha", desc: "Flaky, layered wholemeal bread baked in the tandoor.", price: 7.99 },
      { name: "Methi Lacha Paratha", desc: "Flaky layered paratha flavoured with fenugreek leaves.", price: 7.99 },
      { name: "Pudina Lacha Paratha", desc: "Flaky layered paratha sprinkled with dried mint.", price: 7.99 },
      { name: "Green Chilli Lacha Paratha", desc: "Flaky layered paratha with chopped green chilli.", price: 7.99 },
      { name: "Red Chilli Lacha Paratha", desc: "Flaky layered paratha with crushed red chilli.", price: 7.99 },
      { name: "Masala Lacha Paratha", desc: "Flaky layered paratha dusted with a house spice mix.", price: 7.99 },
      { name: "Makki di Roti", desc: "Punjabi maize flour flatbread, traditionally eaten with saag.", price: 4.99 },
      { name: "Missi Roti", desc: "Spiced flatbread of gram flour and wholemeal flour.", price: 4.99 },
      { name: "Nutella Naan", desc: "Sweet naan filled with Nutella.", price: 5.99 },
    ],
  },
  {
    title: "Kulchas & Stuffed Breads",
    deck: "Amritsar's pride: crisp, layered bread stuffed and baked against the tandoor wall.",
    veg: true,
    dishes: [
      { name: "Aloo Kulcha", desc: "Crisp Amritsari kulcha stuffed with spiced potato, baked in the tandoor with butter.", price: 9.99 },
      { name: "Paneer Kulcha", desc: "Crisp Amritsari kulcha stuffed with spiced paneer, baked in the tandoor with butter.", price: 10.99 },
      { name: "Gobhi Kulcha", desc: "Crisp Amritsari kulcha stuffed with spiced cauliflower, baked in the tandoor with butter.", price: 9.99 },
      { name: "Mix Kulcha", desc: "Crisp Amritsari kulcha with a mixed potato, cauliflower and paneer stuffing.", price: 10.99 },
      { name: "Chicken Tikka Kulcha", desc: "Tandoor-baked kulcha stuffed with spiced chicken tikka.", price: 12.99, veg: false },
      { name: "Lamb Keema Naan", desc: "Naan stuffed with spiced minced lamb.", price: 14.99, veg: false },
      { name: "Chicken Keema Naan", desc: "Naan stuffed with spiced minced chicken.", price: 14.99, veg: false },
    ],
  },
  {
    title: "Biryani",
    deck: "Long-grain basmati layered with spice and sealed until fragrant.",
    veg: true,
    dishes: [
      { name: "Veg Biryani", desc: "Basmati rice layered with mixed vegetables and spices, sealed and slow-cooked on dum.", price: 18.99 },
      { name: "Chicken Biryani", desc: "Basmati rice layered with marinated chicken and spices, sealed and slow-cooked on dum.", price: 21.99, veg: false },
      { name: "Paneer Biryani", desc: "Basmati rice layered with marinated paneer and spices, sealed and slow-cooked on dum.", price: 18.99 },
      { name: "Goat Biryani", desc: "Basmati rice layered with tender goat on the bone and spices, sealed and slow-cooked on dum.", price: 21.99, veg: false },
      { name: "Chap Biryani", desc: "Basmati rice layered with marinated soya chaap and spices, sealed and slow-cooked on dum.", price: 18.99 },
    ],
  },
  {
    title: "Rice",
    deck: "To soak up every last spoon of gravy.",
    veg: true,
    dishes: [
      { name: "Plain Rice", desc: "Steamed basmati rice.", price: 5.99 },
      { name: "Jeera Rice", desc: "Basmati rice tempered with cumin seeds.", price: 6.99 },
      { name: "Peas Pulao", desc: "Basmati rice cooked with green peas and whole spices.", price: 8.99 },
      { name: "Lemon Rice", desc: "Rice tempered with lemon, mustard seeds, curry leaves and peanuts.", price: 8.99 },
      { name: "Veg Fried Rice", desc: "Wok-fried rice with mixed vegetables.", price: 16.99 },
      { name: "Egg Fried Rice", desc: "Wok-fried rice with scrambled egg, vegetables and spring onion.", price: 17.99, veg: false, estimate: true },
      { name: "Chicken Fried Rice", desc: "Wok-fried rice with chicken, vegetables and spring onion.", price: 18.99, veg: false },
      { name: "Paneer Fried Rice", desc: "Wok-fried rice with paneer cubes, vegetables and soy.", price: 16.99 },
    ],
  },
  {
    title: "Sides & Salads",
    deck: "Cool yoghurt to calm the fire, and a crunch of something raw.",
    veg: true,
    dishes: [
      { name: "Raita", desc: "Whisked yoghurt seasoned with roasted cumin.", price: 5.99 },
      { name: "Boondi Raita", desc: "Spiced yoghurt with crisp gram flour pearls.", price: 6.99 },
      { name: "Cucumber Raita", desc: "Cool yoghurt with grated cucumber and roasted cumin.", price: 6.99 },
      { name: "Onion Salad", desc: "Sliced red onion with lemon, green chilli and chaat masala.", price: 6.99 },
      { name: "Mix Salad", desc: "Sliced cucumber, tomato, onion and carrot with lemon.", price: 6.99 },
    ],
  },
  {
    title: "Kids Special",
    deck: "For the little ones at the table.",
    veg: true,
    dishes: [
      { name: "Potato Fries", desc: "Crispy golden potato fries.", price: 7.99, estimate: true },
      { name: "Nuggets and Chips", desc: "Chicken nuggets served with chips.", price: 11.99, veg: false, estimate: true },
    ],
  },
  {
    title: "Combos",
    deck: "A full Punjabi plate for one, put together for you.",
    veg: true,
    dishes: [
      { name: "Kulcha Combo", desc: "One kulcha with chole, chutney, raita, pickle and salad.", price: 16.99 },
      { name: "Saag & Makki Combo", desc: "Sarson ka saag with two makki ki roti, raita, pickle and salad.", price: 17.99 },
      { name: "Paneer Tikka Butter Masala Combo", desc: "Paneer tikka butter masala with two naan, raita and salad.", price: 17.99 },
      { name: "Dal Tadka Combo", desc: "Dal tadka with rice, two roti, raita and salad.", price: 17.99 },
      { name: "Goat Curry Combo", desc: "Goat curry with two naan and salad.", price: 21.99, veg: false },
    ],
  },
  {
    title: "Drinks",
    deck: "Lassi in tall glasses, and chai the way it should be.",
    veg: true,
    dishes: [
      { name: "Mango Lassi", desc: "Chilled yoghurt drink blended with mango.", price: 6.99 },
      { name: "Sweet Lassi", desc: "Thick sweet Punjabi lassi topped with fresh white butter.", sizes: [["Medium", 6.99], ["Large", 10.99]], options: ["With makhan"] },
      { name: "Salted Lassi", desc: "Chilled salted yoghurt drink with roasted cumin.", sizes: [["Medium", 6.99], ["Large", 10.99]] },
      { name: "Masala Chai", desc: "Indian milk tea brewed with ginger, cardamom and spices.", price: 4.99 },
      { name: "Fresh Lime Soda", desc: "Fresh lime with soda, served sweet, salted or mixed.", price: 7.99, options: ["Sweet", "Salted", "Mixed"] },
      { name: "Indian Coffee", desc: "Hot, milky Indian-style coffee.", price: 4.99 },
      { name: "Black Coffee", desc: "Freshly brewed coffee served without milk.", price: 4.99 },
      { name: "Soft Drink", desc: "Can of soft drink.", price: 2.99 },
      { name: "Bottled Water", desc: "Still bottled water.", price: 2.99 },
    ],
  },
  {
    title: "Desserts",
    deck: "Something sweet to close the evening.",
    veg: true,
    dishes: [
      { name: "Gulab Jamun", desc: "Soft milk dumplings soaked in warm rose and cardamom syrup.", price: 5.99 },
      { name: "Rasmalai", desc: "Soft cottage cheese discs in chilled saffron and cardamom milk.", price: 5.99 },
      { name: "Ice Cream", desc: "Scoops of ice cream.", price: 5.99 },
    ],
  },
];
