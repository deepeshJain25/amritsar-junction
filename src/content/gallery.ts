import chole from '../assets/photos/kulcha-plate.jpg';
import kulchaChole from '../assets/photos/kulcha-chole.jpg';
import kulchaPair from '../assets/photos/kulcha-pair.jpg';
import kulchaThali from '../assets/photos/kulcha-thali.jpg';
import dal from '../assets/photos/dal-makhani.jpg';
import jalebiStreet from '../assets/photos/jalebi-street.jpg';
import jalebi from '../assets/photos/jalebi.jpg';
import bhurji from '../assets/photos/paneer-bhurji.jpg';
import saag from '../assets/photos/sarson-ka-saag.jpg';
import skewers from '../assets/photos/tandoor-skewers.jpg';

// The gallery's photo essays: one per dish photographed so far. Each runs about 200 words.
export interface Essay {
  id: string;
  kicker: string;
  title: string;
  native?: string;
  deck: string;
  body: string[];
  photos: { src: ImageMetadata; alt: string; caption: string }[];
}

export const essays: Essay[] = [
  {
    id: 'kulcha',
    kicker: 'Amritsari Kulcha',
    title: 'The bread that wakes the old city',
    native: 'ਅੰਮ੍ਰਿਤਸਰੀ ਕੁਲਚਾ',
    deck: 'Crisp outside, steaming inside, and never eaten without butter.',
    body: [
      "Walk through Amritsar's old city at seven in the morning and you will follow the smell before you see the shop: dough hitting hot clay, butter melting, onions frying. The Amritsari kulcha is the city's breakfast, and its pride. It is nothing like the soft, plain kulcha sold across the rest of North India. This one is rolled with layers of ghee, stuffed with spiced potato, cauliflower, paneer or onion, scattered with coriander seed and pressed onto the scorching inner wall of a tandoor.",
      'A few minutes later it is peeled off with a long iron hook, blistered and golden, the bottom crackling and the layers inside soft and steaming. Then comes the moment every Amritsari waits for: the cook crushes it lightly between his palms to open the layers, and a slab of white butter goes on top and slowly sinks in.',
      "It is served the only way it should be: with a bowl of dark, tangy chole, a sharp tamarind chutney and a heap of onion pickled with chilli. You tear, you scoop, and the butter runs down your wrist. Nobody minds. In Amritsar, that is simply how the day begins, and it is how we would like yours to begin too.",
    ],
    photos: [
      { src: kulchaThali, alt: 'An Amritsari kulcha on a brass thali with chole, white butter and pickle', caption: 'The full plate: kulcha, chole, white butter and pickled onion.' },
      { src: kulchaPair, alt: 'Two golden kulchas topped with coriander seed, chilli and fresh coriander', caption: 'Coriander seed and chilli, pressed into the dough before baking.' },
    ],
  },
  {
    id: 'chole',
    kicker: 'Amritsari Chole',
    title: 'Dark, tangy and made the old way',
    deck: 'The chickpea curry that kulchas and bhature are built around.',
    body: [
      "Every great kulcha needs a partner, and in Amritsar that partner is chole. But these are not the pale, tomato-heavy chickpeas of a takeaway menu. Amritsari chole are almost black, sharp with sourness and deep with roasted spice.",
      'The colour comes from an old Punjabi trick: the chickpeas are boiled with a bundle of black tea leaves, sometimes with dried amla, which stains them a dark mahogany without changing their flavour. The tang comes from anardana, dried pomegranate seed, ground with amchur, dried mango. Then comes the masala: coriander, cumin, black cardamom, cloves and cinnamon, roasted until they crackle, ground coarse, and cooked into the chickpeas until every one is coated.',
      "The result is a curry that is bold rather than hot, with a bitter-sour edge that cuts through butter beautifully. That is why it sits beside the richest breads in Punjab: the kulcha, the puffed bhatura, the crisp aloo tikki. In Amritsar, chole is eaten from morning to midnight, ladled from great brass pots that never seem to empty. A good bowl should leave you reaching for one more piece of bread, then another, until the bowl is wiped clean and the bread is gone.",
    ],
    photos: [
      { src: chole, alt: 'A tray of dark Amritsari chole beside a charred kulcha topped with butter', caption: 'Chole, dark with tea leaves and tangy with pomegranate.' },
      { src: kulchaChole, alt: 'A stack of tandoor-baked kulchas with a bowl of chole behind', caption: 'Kulchas fresh from the tandoor, waiting for the chole.' },
    ],
  },
  {
    id: 'tandoor',
    kicker: 'From the Tandoor',
    title: 'Fire, clay and a little smoke',
    deck: 'The oven at the heart of every Punjabi kitchen.',
    body: [
      'Long before there were restaurants, Punjabi villages had the sanjha chulha: a shared clay oven, dug into the ground, where the women of the village brought their dough each evening to bake rotis together and trade the day\'s news. The tandoor is the descendant of that oven, a bell-shaped clay pot fired with charcoal until its walls glow and the air inside passes four hundred degrees.',
      'That fierce, dry heat does something no pan can. Breads slapped onto the wall puff and blister in a minute. Meat and paneer threaded onto long iron skewers char at the edges while staying juicy within, and the drippings that hit the coals rise back up as fragrant smoke.',
      "The tandoori chicken the world knows was popularised after Partition, when Punjabi cooks who had fled Peshawar brought their ovens to Delhi. Today the same fire gives us paneer tikka in a red yoghurt marinade, malai tikka mellow with cream and cardamom, seekh kebabs dripping with spice and soya chap blistered like street food. Every one carries the same signature: the taste of smoke. Squeeze over some lemon, add a spoon of cool mint chutney and a few rings of raw onion, and you have the whole of Punjab on one plate.",
    ],
    photos: [
      { src: skewers, alt: 'Skewers of paneer, chicken tikka and seekh kebab over glowing coals, wrapped in smoke', caption: 'Paneer, chicken tikka, hariyali and seekh kebab, side by side over the coals.' },
    ],
  },
  {
    id: 'dal-makhani',
    kicker: 'Dal Makhani',
    title: 'Black lentils, butter and patience',
    native: 'ਦਾਲ ਮੱਖਣੀ',
    deck: 'A dish that cannot be rushed, and should not be.',
    body: [
      "Punjabi homes have always cooked maah di dal: whole black urad lentils, simmered for hours on the last embers of the day's fire until they turned creamy. Dal makhani is that humble village dal dressed for a celebration.",
      "Its modern form is credited to the kitchens of Moti Mahal, the restaurant opened in Delhi by Punjabi cooks after Partition. They took the slow-cooked black lentils, added a handful of red kidney beans, and finished the pot with the same rich tomato, butter and cream that made their butter chicken famous. Makhani simply means 'with butter', and the name says everything.",
      'The secret is time. The lentils soak overnight, then simmer low until their skins split and their insides melt into the gravy. They are stirred, mashed against the side of the pot and stirred again, until the dal is thick, glossy and almost smoky. A last spoon of butter and a swirl of cream go in just before it reaches the table.',
      'Eat it with a hot naan, a lachha paratha or plain rice, and do not plan on doing anything energetic afterwards. It is the dish Punjabis order at every celebration.',
    ],
    photos: [
      { src: dal, alt: 'A ladle lifting creamy dal makhani from a dark bowl, swirled with cream and coriander', caption: 'Dal makhani, glossy with butter and swirled with cream.' },
    ],
  },
  {
    id: 'sarson-ka-saag',
    kicker: 'Sarson ka Saag',
    title: 'A Punjabi winter on a plate',
    native: 'ਸਰ੍ਹੋਂ ਦਾ ਸਾਗ',
    deck: 'Mustard greens, cornbread and a spoonful of white butter.',
    body: [
      "In January the fields of Punjab turn yellow with flowering mustard, and in every kitchen a pot of saag goes on the fire. Sarson ka saag is the great winter dish of the Punjabi farmhouse, made from the tender mustard leaves picked before the plant flowers, cooked down with spinach and bathua for softness.",
      "The greens are simmered for hours, then churned with a wooden ghotna until smooth, and thickened with a little makki ka atta, maize flour. The tadka that finishes it is simple and generous: ghee, garlic, ginger, onion and green chilli. The taste is earthy, peppery and slightly bitter, deep green in every sense.",
      'It is never eaten alone. Saag comes with makki di roti, flat golden cornbread patted out by hand and cooked on a griddle, its edges crisp and cracked. A thick slab of white butter melts over the top, a lump of jaggery sits on the side to balance the bitterness, and a tall glass of lassi completes the meal.',
      'For many Punjabis, a plate of saag and makki di roti around the Lohri bonfire is the taste of home, and the reason they count the days until winter comes round again.',
    ],
    photos: [
      { src: saag, alt: 'Sarson ka saag topped with white butter in a wooden bowl, with makki di roti, radish and jaggery', caption: 'Saag with white butter, makki di roti, radish and jaggery.' },
    ],
  },
  {
    id: 'paneer-bhurji',
    kicker: 'Paneer Bhurji',
    title: 'The scramble that feeds a family in ten minutes',
    deck: 'Soft paneer, sweet onions and a hit of green chilli.',
    body: [
      "Every Punjabi family has a dish for when guests arrive unannounced, and in many homes that dish is paneer bhurji. Bhurji simply means scrambled, and it began as the vegetarian cousin of the anda bhurji, the spicy egg scramble cooked on hot griddles at roadside stalls and late-night dhabas across North India.",
      "Paneer is the heart of the Punjabi dairy kitchen: milk curdled with lemon juice, the curds pressed in muslin until firm. Fresh and still soft, it is crumbled by hand straight into a pan of onions fried golden in ghee, with ginger, garlic, chopped tomato and green chilli. A pinch of turmeric gives it colour, a little garam masala gives it warmth, and kasuri methi, dried fenugreek, rubbed between the palms gives it that unmistakable Punjabi perfume.",
      'The paneer drinks in the masala and turns soft and creamy, somewhere between scrambled eggs and a dry curry. Finished with fresh coriander and a squeeze of lime, it is light enough for breakfast and hearty enough for dinner.',
      'Scoop it up with a hot paratha, or tuck it into a roti and eat it on the run. Simple food, done well, is the heart of every Punjabi kitchen.',
    ],
    photos: [
      { src: bhurji, alt: 'Paneer bhurji in an ornate silver dish, garnished with tomato, red onion, coriander and lime', caption: 'Paneer bhurji with red onion, coriander and a wedge of lime.' },
    ],
  },
  {
    id: 'jalebi',
    kicker: 'Jalebi',
    title: 'A thousand years of spirals',
    deck: 'Crisp, syrupy and best eaten hot from the pan.',
    body: [
      'Jalebi is older than almost anything else on a Punjabi table, and it came from far away. Its ancestor, zulbiya, appears in an Arabic cookbook from the tenth century: a fermented batter fried in spirals and soaked in syrup or honey. Persian and Turkish traders carried it east, and by the fifteenth century Indian writers were describing it at feasts.',
      "India made it its own. The batter of flour and yoghurt is left to ferment until it is gently sour, then piped by hand in quick, looping spirals into a wide pan of hot ghee. When the coils are golden and crisp they are plunged straight into a warm syrup scented with cardamom, saffron or rose water, and lifted out glistening and bright orange.",
      'The best jalebi is eaten within minutes: the outside shatters, the hollow inside floods your mouth with syrup, and the faint tang of the fermented batter keeps it from being merely sweet. In Amritsar, jalebi shops do brisk trade from morning until night, and on winter evenings people eat them hot with a bowl of thick, cold rabri.',
      'At any Punjabi wedding, festival or celebration, a tray of jalebi is how you say: today is a good day.',
    ],
    photos: [
      { src: jalebiStreet, alt: 'A tall pile of bright orange jalebi on a wide iron pan at a sweet stall', caption: 'Fresh jalebi piled high at a sweet stall.' },
      { src: jalebi, alt: 'Glistening jalebi spirals in syrup, topped with slivers of pistachio', caption: 'Soaked in syrup and finished with pistachio.' },
    ],
  },
];
