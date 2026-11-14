/**
 * Laa Fresh Stock Manager - Master Data & Catalogs
 */
const KEY='laaFreshSimpleV2', CATALOG=[["Anchovy Dry Fish", {"Chennai Instamart": 100}, 100], ["Anchovy Fish", {"Amazon": 250, "Swiggy": 250}, 250], ["Anchovy Thokku", {"Chennai Instamart": 100}, 100], ["Basa Boneless", {"Pollachi Instamart": 350, "Mysore Instamart": 350, "Blinkit": 0}, 350], ["Basa Boneless Fish", {"Amazon": 250, "Swiggy": 250}, 250], ["Black Pomfret Fish Steak/Slice (Without Head)", {"Amazon": 250, "Swiggy": 250}, 250], ["Bombay Duck Dry Fish", {"Chennai Instamart": 100}, 100], ["Buffalo Meat Boneless", {"Chennai Instamart": 400, "Pollachi Instamart": 400, "Amazon": 450, "Swiggy": 450}, 450], ["Buffalo Meat Fatless Boneless", {"Amazon": 450, "Swiggy": 450}, 450], ["Buffalo Meat Keema", {"Amazon": 450, "Swiggy": 450}, 450], ["Catla Bengali Cut With Head", {"Pollachi Instamart": 350, "Mysore Instamart": 350}, 350], ["Catla Fish Steak/Slice (Without Head)", {"Amazon": 250, "Swiggy": 250}, 250], ["Channa Kunni (Dry Baby Shrimp)", {"Chennai Instamart": 100}, 100], ["Chettinad Chicken Marinade", {"Chennai Instamart": 200, "Amazon": 200, "Swiggy": 200}, 200], ["Chicken 65", {"Amazon": 200, "Swiggy": 200}, 200], ["Chicken Barbecue Topping", {"Amazon": 200, "Swiggy": 200}, 200], ["Chicken Boneless", {"Chennai Instamart": 450, "Pollachi Instamart": 450, "Mysore Instamart": 450}, 450], ["Chicken Breast Boneless", {"Amazon": 400, "Swiggy": 400}, 400], ["Chicken Curry Cut Skinless", {"Chennai Instamart": 450, "Pollachi Instamart": 450, "Mysore Instamart": 450, "Amazon": 400, "Swiggy": 400}, 400], ["Chicken Curry Cut With Skin", {"Pollachi Instamart": 500, "Mysore Instamart": 500}, 500], ["Chicken Drumstick Skinless", {"Chennai Instamart": 500, "Pollachi Instamart": 500, "Mysore Instamart": 500, "Amazon": 400, "Swiggy": 400}, 400], ["Chicken Gizzard", {"Chennai Instamart": 250, "Kolkata Instamart": 250, "Amazon": 200, "Swiggy": 200}, 200], ["Chicken Keema", {"Amazon": 200, "Swiggy": 200}, 200], ["Chicken Leg Boneless", {"Amazon": 400, "Swiggy": 400}, 400], ["Chicken Liver", {"Chennai Instamart": 250, "Kolkata Instamart": 250, "Amazon": 200, "Swiggy": 200}, 200], ["Chicken Lollipop (10 pcs)", {"Amazon": 315, "Swiggy": 315}, 315], ["Chicken Meat Ball", {"Chennai Instamart": 200, "Amazon": 300, "Swiggy": 300}, 300], ["Chicken Piri Piri Topping", {"Amazon": 200, "Swiggy": 200}, 200], ["Chicken Tandoori Tikka Topping", {"Amazon": 200, "Swiggy": 200}, 200], ["Chicken Tikka Marinade", {"Chennai Instamart": 200, "Pollachi Instamart": 200}, 200], ["Chicken Wings With Skin", {"Amazon": 400, "Swiggy": 400}, 400], ["Crunchy Fried Chicken", {"Amazon": 400, "Swiggy": 400}, 400], ["Dry Fish Anchovies", {"Chennai Instamart": 125}, 125], ["Dry Prawns", {"Chennai Instamart": 100}, 100], ["Dry Silver Belly", {"Chennai Instamart": 100}, 100], ["Idiyappam", {"Blinkit": 0}, 4, "pcs"], ["Jumbo Prawn", {"Amazon": 200, "Swiggy": 200}, 200], ["Mahi Mahi (Parala) Fish Boneless", {"Amazon": 200, "Swiggy": 200}, 200], ["Masi Karuvadu Thokku", {"Chennai Instamart": 100}, 100], ["Medium Prawn", {"Pollachi Instamart": 200}, 200], ["Medium Size Prawn", {"Amazon": 200, "Swiggy": 200}, 200], ["Mussel Thokku", {"Chennai Instamart": 100}, 100], ["Mutton Boneless", {"Amazon": 350, "Swiggy": 350}, 350], ["Mutton Brain (1 piece)", {"Amazon": 0, "Swiggy": 0}, 0], ["Mutton Curry Cut", {"Chennai Instamart": 350, "Pollachi Instamart": 350, "Kolkata Instamart": 350, "Amazon": 350, "Swiggy": 350}, 350], ["Mutton Keema", {"Amazon": 200, "Swiggy": 200}, 200], ["Mutton Liver", {"Chennai Instamart": 200, "Pollachi Instamart": 200, "Kolkata Instamart": 200, "Amazon": 200, "Swiggy": 200}, 200], ["Mutton Raan Curry Cut", {"Chennai Instamart": 300}, 300], ["Mutton Shoulder Curry Cut", {"Chennai Instamart": 300}, 300], ["Mutton Trotters (Paya) (6 pcs)", {"Amazon": 110, "Swiggy": 110}, 110], ["Parotta", {}, 0, "pcs"], ["Peri Peri Chicken Wings Marinade", {"Chennai Instamart": 200, "Pollachi Instamart": 200}, 200], ["Petha Dry Fish", {"Chennai Instamart": 100}, 100], ["Powdered Tuna Dry Fish", {"Chennai Instamart": 100}, 100], ["Prawn 65 Marinade", {"Amazon": 200, "Swiggy": 200}, 200], ["Prawn Thokku", {"Chennai Instamart": 100}, 100], ["Ribbon Dry Fish", {"Chennai Instamart": 100}, 100], ["Rohu Bengali Cut", {"Pollachi Instamart": 350, "Mysore Instamart": 350}, 350], ["Rohu Fish Steak/Slice (Without Head)", {"Amazon": 250, "Swiggy": 250}, 250], ["Roochand Curry Cut With Head", {"Pollachi Instamart": 350, "Mysore Instamart": 350}, 350], ["Roop Chand Fish Steak/Slice (Without Head)", {"Amazon": 250, "Swiggy": 250}, 250], ["Roopchand Curry Cut", {"Blinkit": 0}, 0], ["Seer Dry Fish", {"Chennai Instamart": 100}, 100], ["Seer Fish Slice Marinade", {"Amazon": 200, "Swiggy": 200}, 200], ["Seer Fish Steak/Slice (Without Head)", {"Amazon": 300, "Swiggy": 300}, 300], ["Small Seer Fish Curry Cut With Head", {"Amazon": 300, "Swiggy": 300}, 300], ["Squid Thokku", {"Chennai Instamart": 100}, 100], ["Tiger Prawn", {"Amazon": 300, "Swiggy": 300}, 300], ["Tilapia Fish Steak/Slice", {"Amazon": 250, "Swiggy": 250}, 250], ["Trevally Fish Steak/Slice (Without Head)", {"Amazon": 250, "Swiggy": 250}, 250], ["Trevally Whole Fish", {"Amazon": 300, "Swiggy": 300}, 300], ["Tuna Dry Fish", {"Chennai Instamart": 100}, 100], ["Tuna Fish Thokku", {"Chennai Instamart": 100}, 100], ["White Lady Whole Fish", {"Amazon": 250, "Swiggy": 250}, 250], ["White Pomfret Whole Fish (2 pcs)", {"Amazon": 315, "Swiggy": 315}, 315]];
const SUPPLIERS=["Galaxy", "Trojen", "Chennai Dry Fish", "Vanaja Fish", "Nathan Sea Food", "Amritsar", "JK Sea Food", "Swamy Chicken", "Idiyappam MM Foods", "VJ Sea Foods", "Miraki Food Thokku", "Kolkata Mutton", "Mysore Instamart", "Padma Ice", "Sicgil Dry Ice", "Access Pack"];
const CHANNELS=['Chennai Instamart','Pollachi Instamart','Kolkata Instamart','Mysore Instamart','Blinkit','Amazon','Swiggy','Other'],CH=CHANNELS.filter(c=>c!=='Other'),CUSTDEST={'Chennai Instamart':'Chennai','Pollachi Instamart':'Pollachi','Kolkata Instamart':'Kolkata','Mysore Instamart':'Mysore'};

const VPRAW=`#Idiyappam MM Foods
@Idiyappam
RICE IDIYAPPAM|pcs|5.78
#Swamy Chicken
@Chicken
Chilled Chicken Biriyani Curry CutSkinless|kg|215
Chilled Chicken Curry Cutt Skinless|kg|215
Chilled Chicken Breast Boneless|kg|315
Chilled Chicken Drumsticks Skinless|kg|255
Chilled Chicken Medium Wings|kg|190
Chilled Chicken Lollipop|kg|260
Chilled Chicken Leg Boneless|kg|310
Chilled Chicken Gizzard|kg|110
Chilled Chicken Curry Cut with Skin|kg|195
Chilled Chicken Liver|kg|175
Frozen Chicken Biriyani Curry CutSkinless|kg|225.75
Frozen Chicken Curry Cutt Skinless|kg|225.75
Frozen Chicken Breast Boneless|kg|330.75
Frozen Chicken Drumsticks Skinless|kg|267.75
Frozen Chicken Medium Wings|kg|199.5
Frozen Chicken Lollipop|kg|267.75
Frozen Chicken Leg Boneless|kg|325.5
Frozen Chicken Gizzard|kg|115.5
Frozen Chicken Curry Cut with Skin|kg|204.75
Frozen Chicken Liver|kg|68.25
#Beef Vendor
@Buffalo Meat
Buffalo Boneless Meat|kg|270
Buffalo Fatless Meat|kg|280
Buffalo Tenderlion|kg|270
@PK
PK Boneless|kg|550
PK curry cut|kg|450
PK fatless|kg|530
#ANJAN-Delhi & Gurgaon
@ANJAN-Delhi & Gurgaon
BREAST BONELESS (CHICKEN)|pcs|320
GIZZARD (CHICKEN)|pcs|149
ROOHI FISH|pcs|320
LIVER (MUTTON)|pcs|450
Roopchand Fish|pcs|290
CHICKEN KEEMA|pcs|289.8
LIVER (CHICKEN)|pcs|142.8
CATLA FISH|pcs|320
FISH BASSA(Salaman)|pcs|399
White POMFRET|pcs|945
Mutton Currycut|pcs|450
Chettinad Chicken Marinade|pcs|336
Chicken 65|pcs|336
BBQ TOPPING|pcs|315
CHICKEN CUT|pcs|225.75
TANGRI (CHICKEN)-Drumstick|pcs|287.7
THIGH BONELESS (CHICKEN)-Leg Boneless|pcs|389.99
CHICKEN LOLLIPOP|pcs|299.25
CHICKEN MEAT BALLS|pcs|315
Peri Peri Chicken Topping|pcs|315
WINGS WITH SKIN (CHICKEN)|pcs|262.5
CRUNCHY FRIED CHICKEN|pcs|367.5
Mahi Mahi Parala Fish|pcs|399
Medium size PRAWNS|pcs|567
MUTTON BONELESS|pcs|545
BRAIN (MUTTON)|pcs|72.98
MUTTON KEEMA|pcs|450
KHARORE (MUTTON-PAYA))|pcs|72.98
PRAWN 65 MARINATE|pcs|630
Frozen Jumbo Prawn|pcs|913.5
TIGER PRAWNS|pcs|735
CHICKEN TANDOORI TIKKA TOPPING|pcs|315
CHICKEN BBQ TOPPING|pcs|315
CHICKEN PIRI PIRI TOPPING|pcs|315
Mutton Shoulder Curry Cut|pcs|519.75
Mutton Raan Curry Cut|pcs|575.4
Mutton Rip Chops|pcs|548
Mutton Neck Chops|pcs|460
Mutton Soup Bones|pcs|207
#Vanaja Fish
@Fresh Sea Food
Catla fish|kg|150
Rohu Fish|kg|150
Yeri Vavval(Roopchand)|kg|150
Big size Vanjaram|kg|770
Small vanjaram|kg|600
Big size Paarai slice(Travelly)|kg|350
Small Paarai-Whole(travelly)|kg|150
White Vavval(Pompret)|kg|550
Maththi fish(sardine)|kg|150
Black Vavval(pompret)|kg|600
Jilabi(Tilapia)|kg|120
Jilabi Boneless(Tilapia)|kg|120
white Lady|kg|350
Small Prawn|kg|300
Big size Tiger Prawn|kg|400
Small Tiger Prawn|kg|350
MAHI MAHI (PARALA) FISH BONELESS|kg|370
@Mutton
Mutton Paya|pcs|250
Mutton Liver|kg|550
#Sea food frozen
@Fresh Sea Food
Ancovy fish|kg|260
Basa fish|kg|370
Prawn 40-C|kg|550
Prawn 80-C|kg|525
Seer fish slice|kg|770
Tiger prawn|kg|540
White pomfret|kg|550
#Nathan Sea Food
@Fresh Sea Food
Basa fish|kg|350
Prawn 80-C|kg|550
Seer fish slice|kg|770
Tiger prawn|kg|590
#Kolkata Mutton
@Mutton
Mutton Currycut|kg|720
Mutton Liver|kg|720
MUTTON KEEMA|kg|720
#RKB Polybag
@Laa Fresh Cover
Laa Fresh Cover|kg|359.9
#Aura
@Cold Cut
Chicken Nugget|kg|325
Chicken Momo|kg|155
Fish Finger Marinated|kg|475
Peri Peri Sprinkler|kg|220
Chicken Breakfast Sausage|kg|265
Chicken Popcorn|kg|340
#Fair Land
@Masala
Chicken 65 Masala 100gms|pcs|37
Prawn 65 Masala 100gms|pcs|37
Seer Fish Masala 100gms|pcs|37
Chettinad Chicken Masala 100gms|pcs|37
#Dry ice
@Dry Ice
Dry Ice|kg|33.04
#Padma Ice
@Wet Ice
Wet Ice|kg|10
#Ld cover
@LD cover
LD cover|kg|240
@Stationery
Brown and white tape|pcs|60
Carry bag(20*26)|kg|120
Carry bag(24*30)|kg|150
#Aura-House keeping material
@House keeping material
Colin|pcs|249.99
Phenoyle|pcs|175.01
Soap oil|pcs|300
Dishwash|pcs|300
Toilet cleaner|pcs|249.99
#Thermocal box
@Thermocol box
Thermacol box 60 Ltr|pcs|0
Thermacol box 100 Ltr|pcs|0
Thermacol box 120 Ltr|pcs|0
Thermacol box 160 Ltr|pcs|0
#Mk lables
@Laa Fresh Label Roll
Laa fresh sticker role|pcs|519.2
#Local Shop
@Stationery
A4 sheet|pcs|250
Marker|pcs|20
Stapler|pcs|40
Stapler pin|pcs|10
Pen|pcs|5
Note|pcs|40
Small white tape|pcs|25
Mrp print remover|pcs|50
#Bhubanewar
@Bhubaneswar Vendor
Chicken Curry Cut 450Gms|pcs|90
Chicken Curry Cut With Skin 500Gms|pcs|100
Chicken Boneless 450Gms|pcs|99
Chicken Drumstick 500Gms|pcs|110
Catla fish 350Gms|pcs|84
Rohu Fish 350Gms|pcs|66.5
Mutton Currycut 350Gms|pcs|245
Bhubaneswar Wet Ice per Bill|pcs|300
#Berhampur
@Berhampur Vendor
Chicken Boneless 450Gms|pcs|90
Chicken Curry Cut 450Gms|pcs|90
Chicken Drumstick 500Gms|pcs|100
#Mysore
@Mysore Vendor
Chicken Curry Cut|kg|0
Chicken Drumstick|kg|0
Chicken Boneless|kg|0
Mutton Currycut|kg|660
Fish Packing Charges|pcs|8
Mysore Ld Cover Charges|pcs|750
Mysore Delivery Charges|pcs|250
Mysore Tandoori Masala|kg|900
Mysore Peri Peri Masala|kg|700
LAA FRESH BASA BONLESS|kg|0
LAA FRESH CATLA BENGALI CUT WITH HEAD|kg|0
LAA FRESH ROHU BENGALI CUT|kg|0
LAA FRESH ROOCH AND CURRY CUT W ITH HEAD|kg|0
#ANJAN-Chennai
@ANJAN-CHENNAI
CHICKEN KEEMA|pcs|289.8
Mutton Currycut|pcs|450
BBQ TOPPING|pcs|315
CHICKEN MEAT BALLS|pcs|315
Peri Peri Chicken Topping|pcs|315
CRUNCHY FRIED CHICKEN|pcs|367.5
MUTTON BONELESS|pcs|545
BRAIN (MUTTON)|pcs|72.98
MUTTON KEEMA|pcs|450
CHICKEN TANDOORI TIKKA TOPPING|pcs|315
CHICKEN BBQ TOPPING|pcs|315
CHICKEN PIRI PIRI TOPPING|pcs|315
Mutton Shoulder Curry Cut|pcs|519.75
Mutton Raan Curry Cut|pcs|574.5
Mutton Rip Chops|pcs|548
Mutton Neck Chops|pcs|460
Mutton Soup Bones|pcs|207
#Dry fish kaleel
@Dry Fish
Anchovy dry fish|kg|300
Ribbon dry fish|kg|240
Bombay duck|kg|500
Channa kunni|kg|200
Dry prawn|kg|400
Petha dry fish|kg|220
Powder tuna|kg|600
Tuna dry fish|kg|500
#Saidapet market
@Dry Fish
Seer dry fish|kg|650
Petha dry fish|kg|350
Ribbon dry fish|kg|310
Dry silver belly|kg|200
#Thokku product
@Thokku
Anchovy pickle|pcs|70
Masi karuvadu pickle|pcs|119
Prawn pickle|pcs|119
Squid pickle|pcs|119
Tuna pickle|pcs|100
Mussel pickle|pcs|145
`;
const APN=`Frozen Chicken Curry Cut Skinless|Frozen Chicken Breast Boneless|Frozen Chicken Drumstick Skinless|Frozen Chicken Leg Boneless|Frozen Chicken Wings with Skin|Frozen Chicken Lollipop|Frozen Chicken Keema|Frozen Mutton Keema|Frozen Mutton Curry Cut|Frozen Mutton Boneless|Frozen Mutton Trotters(Paya)(6 Pcs)|Frozen Mutton liver|Frozen Mutton Brain|Frozen Buffalo Meat Boneless|Frozen Buffalo Meat Fatless Boneless|Frozen Buffalo Meat Keema|Frozen Seer Fish Steak /Slice (without head)|Frozen Small Seer Fish Curry Cut with Head|Frozen Trevally Fish Steak /Slice (without head)|Frozen Roopchand Fish Steak /Slice (without head)|Frozen Catla Fish Steak /Slice (without head)|Frozen Rohu Fish Steak /Slice (without head)|Frozen White Pomfret whole Fish|Frozen Black Pomfret Fish Steak /Slice (without head)|Frozen Basa Boneless Fish|Frozen White Lady whole Fish|Frozen Tilipia Fish Steak /Slice|Frozen Jumbo Prawn|Frozen Tiger Prawn|Frozen Medium Size Prawn|Frozen CHICKEN MEAT BALL|Frozen CHICKEN TANDOORI TIKKA TOPPING|Frozen CHICKEN BBQ TOPPING|Frozen CHICKEN PIRI PIRI TOPPING|Frozen CRUNCHY FRIED CHICKEN|Frozen Chicken 65|Frozen Chettinad Chicken Marinade|Frozen Prawn 65 Marinade|Frozen Seer Fish Slice Marinade|Frozen Anchovy Fish|Frozen Trevally whole Fish|Frozen Mahi Mahi (Parala) Fish Boneless|Frozen Chicken Liver|Frozen Chicken Gizzard`.split('|');
const VP={};
function addVP(s,c,n,u,r){let a=VP[s]=VP[s]||[],i=a.findIndex(x=>x.name===n&&x.cat===c);if(i>=0)a[i].rate=r;else a.push({cat:c,name:n,unit:u,rate:r})}
(function(){let s='',c='';VPRAW.split('\n').forEach(l=>{l=l.trim();if(!l)return;if(l[0]==='#'){s=l.slice(1);c=''}else if(l[0]==='@')c=l.slice(1);else{let p=l.split('|');addVP(s,c,p[0].trim(),p[1].trim().toLowerCase(),+p[2])}});APN.forEach(n=>{n=n.trim();addVP('Access Pack','Stickers',n,'pcs',1.4);addVP('Access Pack','Laa Frozen-Product Wise Cover',n.replace(/^Frozen (?=CHICKEN (MEAT|TANDOORI|BBQ|PIRI)|CRUNCHY)/,''),'kg',1.7)});addVP('Access Pack','Laa Frozen Cover','Laa Frozen Covers','kg',1.4)})();
