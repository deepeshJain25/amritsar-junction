// Editorial copy for the menu page, keyed by the category name exactly as it comes from the POS.
// The order here is the order chapters appear on the page. A category the POS adds later still
// shows, after these, just without an intro; renaming one in the POS drops its intro until it is renamed here too.
// Dishes, prices and descriptions all come from the storefront API, not from this file.
export const sectionCopy: Record<string, string> = {
  Chaats: 'Street food from the old streets of Amritsar: crisp, tangy, sweet and cold all in one bite.',
  'Entrée Vegetarian': "Paneer and soya chap, marinated and kissed by the tandoor's fire.",
  Momo: 'Hand-folded dumplings, steamed, fried or tossed in the wok.',
  'Indo Chinese Veg': 'The wok-tossed food every Punjabi grows up craving: hot, glossy and loud with garlic.',
  'Indo Chinese Non-Veg': 'Chicken and prawns from the wok, with all the fire.',
  'Non Veg Entrée': 'Kebabs and tikkas straight off the skewer, smoky and still sizzling.',
  'Seafood Entrée': "Fish and prawns, Amritsar's other great love.",
  'Veg Mains': 'Slow pots, butter and lentils: the heart of a Punjabi table.',
  'Non-Veg Mains': 'The curries people cross the city for.',
  'Amritsari Special Kulcha': "Amritsar's pride: crisp, layered bread stuffed and baked against the tandoor wall.",
  'Amritsari Special Kulcha Combo': 'The Amritsar breakfast as a full plate: kulcha, bhature or poori with chole and all the trimmings.',
  Breads: 'Slapped against the clay wall of the tandoor and brought to the table blistered and hot.',
  'Tandoori Dum Biryani': 'Long-grain basmati layered with spice and sealed until fragrant.',
  Rice: 'To soak up every last spoon of gravy.',
  Rolls: 'Tikka from the tandoor, rolled up to eat with your hands.',
  Sabji: 'Greens cooked slow, the way they are in a Punjabi village.',
  Sides: 'Cool yoghurt to calm the fire.',
  Salad: 'A crunch of something raw.',
  'Veg Combo': 'A curry with its bread or rice, plated together as a full meal for one.',
  'Non Veg Combo': 'Our meat curries with rice or naan and a salad, a full meal for one.',
  Combos: 'A full Punjabi plate, put together for you.',
  'Kids Special': 'For the little ones at the table.',
  Dessert: 'Something sweet to close the evening.',
  Drinks: 'Lassi in tall glasses, and chai the way it should be.',
};
