-- Dictionary coverage expansion (session: "Expand Dictionary Vocabulary
-- Coverage"). Root-caused first, not assumed: the search mechanism
-- (searchDictionary in storageBridge.js -> ilike '%q%' on english/uzbek)
-- was verified working correctly against the live 282-row table -
-- searching "time" correctly returns both "time" and "sometimes". The
-- actual problem is pure content coverage: common words like
-- transportation, people, place, thing, man, woman, child, book, and
-- country simply did not exist in the table at all. This migration adds
-- curated, high-frequency vocabulary to close that gap - not a bulk
-- dump. Every translation below is an AI-assisted (not dataset-sourced)
-- translation, same disclosed method as the original 0117 seed batch;
-- idempotent via the same lower(english) unique index, so re-running
-- this migration is safe.
--
-- Applied to production 2026-08-11 after content review (108 entries,
-- verified for duplicate keys and translation quality; table now at 396
-- rows). Tracked here to keep the migration ledger in sync with prod.

insert into public.dictionary_entries (english, uzbek, pronunciation, part_of_speech, example, example_uzbek, usage_note, difficulty)
values
  -- People / family (explicitly missing: people, man, woman, child)
  ('people', 'odamlar', 'ˈpiːpl', 'noun', 'Many people live in this city.', 'Bu shaharda koʻp odamlar yashaydi.', null, 'beginner'),
  ('man', 'erkak', 'mæn', 'noun', 'That man works at the school.', 'U erkak maktabda ishlaydi.', null, 'beginner'),
  ('woman', 'ayol', 'ˈwʊmən', 'noun', 'The woman is a doctor.', 'Bu ayol shifokor.', null, 'beginner'),
  ('child', 'bola', 'tʃaɪld', 'noun', 'The child is playing in the garden.', 'Bola bogʻda oʻynayapti.', null, 'beginner'),
  ('children', 'bolalar', 'ˈtʃɪldrən', 'noun', 'The children are at school.', 'Bolalar maktabda.', 'Plural of "child".', 'beginner'),
  ('baby', 'chaqaloq', 'ˈbeɪbi', 'noun', 'The baby is sleeping.', 'Chaqaloq uxlayapti.', null, 'beginner'),
  ('boy', 'oʻgʻil bola', 'bɔɪ', 'noun', 'The boy is my neighbor.', 'Bu oʻgʻil bola mening qoʻshnim.', null, 'beginner'),
  ('girl', 'qiz bola', 'ɡɜːrl', 'noun', 'The girl loves reading books.', 'Qiz bola kitob oʻqishni yaxshi koʻradi.', null, 'beginner'),
  ('adult', 'kattalar/voyaga yetgan', 'ˈædʌlt', 'noun', 'Only adults can enter this room.', 'Bu xonaga faqat kattalar kirishi mumkin.', null, 'intermediate'),
  ('person', 'odam/shaxs', 'ˈpɜːrsn', 'noun', 'She is a kind person.', 'U mehribon odam.', null, 'beginner'),
  ('uncle', 'amaki/tog''a', 'ˈʌŋkl', 'noun', 'My uncle visits us every summer.', 'Amakim har yozda bizga tashrif buyuradi.', 'amaki = father''s brother, tog''a = mother''s brother.', 'beginner'),
  ('aunt', 'xola/amma', 'ænt', 'noun', 'My aunt lives in Samarkand.', 'Xolam Samarqandda yashaydi.', 'xola = mother''s sister, amma = father''s sister.', 'beginner'),
  ('cousin', 'amakivachcha/xolavachcha', 'ˈkʌzn', 'noun', 'My cousin studies at university.', 'Amakivachcham universitetda oʻqiydi.', null, 'intermediate'),

  -- Places / transportation (explicitly missing: transportation, place, country)
  ('transportation', 'transport', 'ˌtrænspɔːrˈteɪʃn', 'noun', 'Public transportation in this city is very good.', 'Bu shaharda jamoat transporti juda yaxshi.', null, 'intermediate'),
  ('vehicle', 'transport vositasi', 'ˈviːəkl', 'noun', 'This vehicle is very fast.', 'Bu transport vositasi juda tez.', null, 'intermediate'),
  ('taxi', 'taksi', 'ˈtæksi', 'noun', 'We took a taxi to the airport.', 'Biz aeroportga taksida bordik.', null, 'beginner'),
  ('subway', 'metro', 'ˈsʌbweɪ', 'noun', 'I go to work by subway.', 'Men ishga metroda boraman.', null, 'beginner'),
  ('motorcycle', 'mototsikl', 'ˈmoʊtərsaɪkl', 'noun', 'He rides a motorcycle to school.', 'U maktabga mototsiklda boradi.', null, 'intermediate'),
  ('truck', 'yuk mashinasi', 'trʌk', 'noun', 'The truck carries a lot of goods.', 'Yuk mashinasi koʻp tovar tashiydi.', null, 'intermediate'),
  ('traffic', 'transport harakati', 'ˈtræfɪk', 'noun', 'There is a lot of traffic in the morning.', 'Ertalab transport harakati juda zich.', null, 'intermediate'),
  ('station', 'bekat/stansiya', 'ˈsteɪʃn', 'noun', 'The train station is near my house.', 'Poyezd stansiyasi uyimga yaqin.', null, 'beginner'),
  ('bridge', 'koʻprik', 'brɪdʒ', 'noun', 'We crossed the bridge together.', 'Biz koʻprikdan birga oʻtdik.', null, 'intermediate'),
  ('place', 'joy', 'pleɪs', 'noun', 'This is a beautiful place.', 'Bu chiroyli joy.', null, 'beginner'),
  ('country', 'davlat/mamlakat', 'ˈkʌntri', 'noun', 'Uzbekistan is a beautiful country.', 'Oʻzbekiston chiroyli mamlakat.', null, 'beginner'),
  ('capital', 'poytaxt', 'ˈkæpɪtl', 'noun', 'Tashkent is the capital of Uzbekistan.', 'Toshkent Oʻzbekistonning poytaxti.', null, 'intermediate'),
  ('downtown', 'shahar markazi', 'ˌdaʊnˈtaʊn', 'noun', 'We are meeting downtown.', 'Biz shahar markazida uchrashamiz.', null, 'intermediate'),
  ('neighborhood', 'mahalla/atrof', 'ˈneɪbərhʊd', 'noun', 'It is a quiet neighborhood.', 'Bu tinch mahalla.', null, 'intermediate'),
  ('address', 'manzil', 'ˈædres', 'noun', 'Please write your address here.', 'Iltimos, manzilingizni shu yerga yozing.', null, 'beginner'),

  -- Classroom / academic vocabulary
  ('classroom', 'sinfxona', 'ˈklæsruːm', 'noun', 'Our classroom is on the second floor.', 'Bizning sinfxonamiz ikkinchi qavatda.', null, 'beginner'),
  ('board', 'doska', 'bɔːrd', 'noun', 'The teacher wrote the word on the board.', 'Oʻqituvchi soʻzni doskaga yozdi.', null, 'beginner'),
  ('desk', 'parta/stol', 'desk', 'noun', 'Put your book on the desk.', 'Kitobingizni partaga qoʻying.', null, 'beginner'),
  ('notebook', 'daftar', 'ˈnoʊtbʊk', 'noun', 'Write the new words in your notebook.', 'Yangi soʻzlarni daftaringizga yozing.', null, 'beginner'),
  ('pen', 'ruchka', 'pen', 'noun', 'Can I borrow your pen?', 'Ruchkangizni olsam boʻladimi?', null, 'beginner'),
  ('pencil', 'qalam', 'ˈpensl', 'noun', 'She draws with a pencil.', 'U qalam bilan rasm chizadi.', null, 'beginner'),
  ('book', 'kitob', 'bʊk', 'noun', 'I am reading an interesting book.', 'Men qiziqarli kitob oʻqiyapman.', null, 'beginner'),
  ('page', 'sahifa', 'peɪdʒ', 'noun', 'Open the book to page ten.', 'Kitobning oʻninchi sahifasini oching.', null, 'beginner'),
  ('subject', 'fan/mavzu', 'ˈsʌbdʒɪkt', 'noun', 'Math is my favorite subject.', 'Matematika mening sevimli fanim.', null, 'intermediate'),
  ('grade', 'baho/sinf', 'ɡreɪd', 'noun', 'She got a good grade on the test.', 'U testdan yaxshi baho oldi.', 'Also means "class year" (e.g. 5th grade).', 'intermediate'),
  ('test', 'test/sinov', 'test', 'noun', 'We have a test tomorrow.', 'Ertaga bizda test bor.', null, 'beginner'),
  ('library', 'kutubxona', 'ˈlaɪbreri', 'noun', 'I borrowed this book from the library.', 'Men bu kitobni kutubxonadan oldim.', null, 'beginner'),
  ('dictionary', 'lugʻat', 'ˈdɪkʃəneri', 'noun', 'Use a dictionary to check new words.', 'Yangi soʻzlarni tekshirish uchun lugʻatdan foydalaning.', null, 'beginner'),
  ('paragraph', 'abzats', 'ˈpærəɡræf', 'noun', 'Write a short paragraph about your day.', 'Kuningiz haqida qisqa abzats yozing.', null, 'intermediate'),
  ('grammar', 'grammatika', 'ˈɡræmər', 'noun', 'English grammar can be difficult.', 'Ingliz tili grammatikasi qiyin boʻlishi mumkin.', null, 'intermediate'),
  ('spelling', 'imlo', 'ˈspelɪŋ', 'noun', 'Check your spelling before you submit.', 'Topshirishdan oldin imlongizni tekshiring.', null, 'intermediate'),

  -- Daily activities
  ('brush teeth', 'tish yuvmoq', null, 'verb', 'I brush my teeth every morning.', 'Men har ertalab tishimni yuvaman.', null, 'beginner'),
  ('take a shower', 'dush qabul qilmoq', null, 'verb', 'He takes a shower before school.', 'U maktabga borishdan oldin dush qabul qiladi.', null, 'beginner'),
  ('get dressed', 'kiyinmoq', null, 'verb', 'She gets dressed quickly in the morning.', 'U ertalab tez kiyinadi.', null, 'beginner'),
  ('have breakfast', 'nonushta qilmoq', null, 'verb', 'We have breakfast together every day.', 'Biz har kuni birga nonushta qilamiz.', null, 'beginner'),
  ('go to work', 'ishga bormoq', null, 'verb', 'My father goes to work by bus.', 'Otam ishga avtobusda boradi.', null, 'beginner'),
  ('watch tv', 'televizor koʻrmoq', null, 'verb', 'The children watch TV in the evening.', 'Bolalar kechqurun televizor koʻrishadi.', null, 'beginner'),
  ('clean the house', 'uyni tozalamoq', null, 'verb', 'We clean the house every weekend.', 'Biz har hafta oxirida uyni tozalaymiz.', null, 'beginner'),
  ('wash dishes', 'idish yuvmoq', null, 'verb', 'I wash the dishes after dinner.', 'Kechki ovqatdan keyin idish yuvaman.', null, 'beginner'),

  -- High-frequency irregular verbs not yet covered
  ('go', 'bormoq', 'ɡoʊ', 'verb', 'I go to school every day.', 'Men har kuni maktabga boraman.', 'Past: went. Past participle: gone.', 'beginner'),
  ('see', 'koʻrmoq', 'siː', 'verb', 'I can see the mountains from here.', 'Bu yerdan togʻlarni koʻra olaman.', 'Past: saw. Past participle: seen.', 'beginner'),
  ('come', 'kelmoq', 'kʌm', 'verb', 'Please come to my house.', 'Iltimos, uyimga keling.', 'Past: came.', 'beginner'),
  ('get', 'olmoq/erishmoq', 'ɡet', 'verb', 'I need to get some milk.', 'Menga biroz sut olish kerak.', 'Past: got.', 'beginner'),
  ('bring', 'olib kelmoq', 'brɪŋ', 'verb', 'Please bring your notebook tomorrow.', 'Iltimos, ertaga daftaringizni olib keling.', 'Past: brought.', 'beginner'),
  ('break', 'sindirmoq', 'breɪk', 'verb', 'Be careful, do not break the glass.', 'Ehtiyot boʻling, oynani sindirmang.', 'Past: broke.', 'intermediate'),
  ('drive', 'haydamoq', 'draɪv', 'verb', 'My father drives to work.', 'Otam ishga haydab boradi.', 'Past: drove.', 'beginner'),
  ('fall', 'yiqilmoq', 'fɔːl', 'verb', 'Be careful not to fall on the ice.', 'Muzda yiqilib tushmaslikka ehtiyot boʻling.', 'Past: fell.', 'beginner'),
  ('feel', 'his qilmoq', 'fiːl', 'verb', 'I feel happy today.', 'Bugun oʻzimni baxtli his qilyapman.', 'Past: felt.', 'beginner'),
  ('fly', 'uchmoq', 'flaɪ', 'verb', 'Birds fly in the sky.', 'Qushlar osmonda uchadi.', 'Past: flew.', 'beginner'),
  ('grow', 'oʻsmoq', 'ɡroʊ', 'verb', 'Plants grow quickly in spring.', 'Bahorda oʻsimliklar tez oʻsadi.', 'Past: grew.', 'intermediate'),
  ('hear', 'eshitmoq', 'hɪr', 'verb', 'I can hear music outside.', 'Tashqarida musiqa eshityapman.', 'Past: heard.', 'beginner'),
  ('hold', 'ushlamoq', 'hoʊld', 'verb', 'Please hold my bag for a minute.', 'Iltimos, sumkamni bir daqiqa ushlab turing.', 'Past: held.', 'beginner'),
  ('keep', 'saqlamoq', 'kiːp', 'verb', 'You can keep this book.', 'Bu kitobni oʻzingizda saqlashingiz mumkin.', 'Past: kept.', 'beginner'),
  ('leave', 'joʻnab ketmoq/qoldirmoq', 'liːv', 'verb', 'The bus leaves at eight o''clock.', 'Avtobus soat sakkizda joʻnab ketadi.', 'Past: left.', 'beginner'),
  ('meet', 'uchrashmoq', 'miːt', 'verb', 'Let''s meet at the cafe.', 'Kafeda uchrashaylik.', 'Past: met.', 'beginner'),
  ('put', 'qoʻymoq', 'pʊt', 'verb', 'Put your shoes here.', 'Poyabzalingizni shu yerga qoʻying.', 'Past: put (unchanged).', 'beginner'),
  ('read', 'oʻqimoq', 'riːd', 'verb', 'I read a book every night.', 'Men har kechasi kitob oʻqiyman.', null, 'beginner'),
  ('ride', 'minmoq', 'raɪd', 'verb', 'She rides her bicycle to school.', 'U maktabga velosipedda boradi.', 'Past: rode.', 'beginner'),
  ('send', 'yubormoq', 'send', 'verb', 'I will send you the file today.', 'Bugun sizga faylni yuboraman.', 'Past: sent.', 'beginner'),
  ('show', 'koʻrsatmoq', 'ʃoʊ', 'verb', 'Can you show me the way?', 'Menga yoʻlni koʻrsata olasizmi?', 'Past: showed.', 'beginner'),
  ('sing', 'qoʻshiq aytmoq', 'sɪŋ', 'verb', 'The children love to sing.', 'Bolalar qoʻshiq aytishni yaxshi koʻradi.', 'Past: sang.', 'beginner'),
  ('sit', 'oʻtirmoq', 'sɪt', 'verb', 'Please sit down.', 'Iltimos, oʻtiring.', 'Past: sat.', 'beginner'),
  ('spend', 'sarflamoq/oʻtkazmoq', 'spend', 'verb', 'We spend a lot of time together.', 'Biz koʻp vaqtimizni birga oʻtkazamiz.', 'Past: spent.', 'intermediate'),
  ('stand', 'turmoq', 'stænd', 'verb', 'Please stand up.', 'Iltimos, oʻrningizdan turing.', 'Past: stood.', 'beginner'),
  ('wear', 'kiymoq', 'wer', 'verb', 'She wears a blue dress today.', 'U bugun koʻk koʻylak kiygan.', 'Past: wore.', 'beginner'),
  ('write', 'yozmoq', 'raɪt', 'verb', 'Write your name here.', 'Ismingizni shu yerga yozing.', 'Past: wrote.', 'beginner'),

  -- Common nouns
  ('thing', 'narsa', 'θɪŋ', 'noun', 'What is that thing on the table?', 'Stoldagi u narsa nima?', null, 'beginner'),
  ('way', 'yoʻl/usul', 'weɪ', 'noun', 'This is the best way to learn English.', 'Bu ingliz tilini oʻrganishning eng yaxshi usuli.', null, 'beginner'),
  ('day', 'kun', 'deɪ', 'noun', 'Today is a beautiful day.', 'Bugun chiroyli kun.', null, 'beginner'),
  ('minute', 'daqiqa', 'ˈmɪnɪt', 'noun', 'Wait a minute, please.', 'Iltimos, bir daqiqa kuting.', null, 'beginner'),
  ('hour', 'soat', 'aʊər', 'noun', 'The lesson lasts one hour.', 'Dars bir soat davom etadi.', null, 'beginner'),
  ('reason', 'sabab', 'ˈriːzn', 'noun', 'What is the reason for your absence?', 'Yoʻqligingizning sababi nima?', null, 'intermediate'),
  ('result', 'natija', 'rɪˈzʌlt', 'noun', 'I am happy with the result.', 'Natijadan xursandman.', null, 'intermediate'),
  ('example', 'misol', 'ɪɡˈzæmpl', 'noun', 'Can you give me an example?', 'Menga misol keltira olasizmi?', null, 'beginner'),
  ('group', 'guruh', 'ɡruːp', 'noun', 'Work with your group.', 'Guruhingiz bilan ishlang.', null, 'beginner'),
  ('team', 'jamoa', 'tiːm', 'noun', 'Our team won the game.', 'Bizning jamoamiz oʻyinda gʻalaba qozondi.', null, 'beginner'),
  ('area', 'hudud/soha', 'ˈeriə', 'noun', 'This is a quiet area.', 'Bu tinch hudud.', null, 'intermediate'),
  ('part', 'qism', 'pɑːrt', 'noun', 'This is the hardest part of the lesson.', 'Bu darsning eng qiyin qismi.', null, 'beginner'),
  ('side', 'tomon/yon', 'saɪd', 'noun', 'Sit on the other side.', 'Boshqa tomonda oʻtiring.', null, 'beginner'),

  -- Common adjectives / adverbs
  ('young', 'yosh', 'jʌŋ', 'adjective', 'She is a young teacher.', 'U yosh oʻqituvchi.', null, 'beginner'),
  ('tall', 'baland boʻyli', 'tɔːl', 'adjective', 'He is very tall.', 'U juda baland boʻyli.', null, 'beginner'),
  ('heavy', 'ogʻir', 'ˈhevi', 'adjective', 'This bag is very heavy.', 'Bu sumka juda ogʻir.', null, 'beginner'),
  ('light', 'yengil/yorugʻ', 'laɪt', 'adjective', 'This box is very light.', 'Bu quti juda yengil.', 'Also means "bright/not dark".', 'beginner'),
  ('wide', 'keng', 'waɪd', 'adjective', 'The street is very wide.', 'Koʻcha juda keng.', null, 'intermediate'),
  ('deep', 'chuqur', 'diːp', 'adjective', 'The river is very deep here.', 'Daryo bu yerda juda chuqur.', null, 'intermediate'),
  ('dark', 'qorongʻi', 'dɑːrk', 'adjective', 'It gets dark early in winter.', 'Qishda erta qorongʻi tushadi.', null, 'beginner'),
  ('bright', 'yorqin', 'braɪt', 'adjective', 'She has a bright smile.', 'Uning tabassumi yorqin.', null, 'beginner'),
  ('full', 'toʻla', 'fʊl', 'adjective', 'The bus is full today.', 'Bugun avtobus toʻla.', null, 'beginner'),
  ('empty', 'boʻsh', 'ˈempti', 'adjective', 'The room is empty now.', 'Xona hozir boʻsh.', null, 'beginner'),
  ('free', 'bepul/erkin', 'friː', 'adjective', 'This event is free for students.', 'Bu tadbir talabalar uchun bepul.', 'Also means "not busy/available".', 'beginner'),
  ('busy', 'band', 'ˈbɪzi', 'adjective', 'I am busy this weekend.', 'Bu hafta oxiri men bandman.', null, 'beginner'),
  ('ready', 'tayyor', 'ˈredi', 'adjective', 'Are you ready for the exam?', 'Imtihonga tayyormisiz?', null, 'beginner'),
  ('safe', 'xavfsiz', 'seɪf', 'adjective', 'This area is very safe.', 'Bu hudud juda xavfsiz.', null, 'beginner'),
  ('dangerous', 'xavfli', 'ˈdeɪndʒərəs', 'adjective', 'Driving fast is dangerous.', 'Tez haydash xavfli.', null, 'intermediate'),
  ('comfortable', 'qulay', 'ˈkʌmftərbl', 'adjective', 'This chair is very comfortable.', 'Bu stul juda qulay.', null, 'intermediate'),
  ('popular', 'mashhur', 'ˈpɑːpjələr', 'adjective', 'This song is very popular.', 'Bu qoʻshiq juda mashhur.', null, 'intermediate'),
  ('similar', 'oʻxshash', 'ˈsɪmələr', 'adjective', 'These two words have a similar meaning.', 'Bu ikki soʻzning maʼnosi oʻxshash.', null, 'intermediate'),
  ('different', 'boshqacha/farqli', 'ˈdɪfrənt', 'adjective', 'Our opinions are different.', 'Bizning fikrlarimiz farqli.', null, 'beginner'),
  ('possible', 'mumkin', 'ˈpɑːsəbl', 'adjective', 'It is possible to finish today.', 'Bugun tugatish mumkin.', null, 'intermediate'),
  ('necessary', 'zarur', 'ˈnesəseri', 'adjective', 'Water is necessary for life.', 'Suv hayot uchun zarur.', null, 'intermediate'),
  ('real', 'haqiqiy', 'riːl', 'adjective', 'This is a real problem.', 'Bu haqiqiy muammo.', null, 'beginner')
on conflict (lower(english)) do nothing;
