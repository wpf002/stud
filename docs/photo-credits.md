# Photo credits

Every breed photo in the seeded dataset is the lead image from that breed’s own
English Wikipedia article, which is why they are breed-accurate: the article is
about the breed, so its lead image is that breed. Sourced via the Wikipedia REST
API and Wikimedia Commons — regenerate with:

```bash
python3 packages/db/scripts/fetch-breed-photos.py
```

Most carry a CC BY-SA or similar licence that requires attribution. The credit
is stored on each dog photo (`DogMedia.caption`) and listed here in full.

| Breed | Licence | Credit | File |
|---|---|---|---|
| French Bulldog | CC BY-SA 4.0 | Ildar Sagdejev (Specious) | [2008-07-28_Dog_at_Frolick_Field.jpg](https://commons.wikimedia.org/wiki/File:2008-07-28_Dog_at_Frolick_Field.jpg) |
| Labrador Retriever | CC BY-SA 2.0 | IDS.photos from Tiverton, UK | [Labrador_on_Quantock_(2175262184).jpg](https://commons.wikimedia.org/wiki/File:Labrador_on_Quantock_(2175262184).jpg) |
| Golden Retriever | Public domain | Dukedestiny01.jpg: "Janneke Vreugdenhil" derivative work: An | [Golden_Retriever_Dukedestiny01_drvd.jpg](https://commons.wikimedia.org/wiki/File:Golden_Retriever_Dukedestiny01_drvd.jpg) |
| German Shepherd Dog | CC BY-SA 2.5 | gomagoti | [German_Shepherd_-_DSC_0346_(10096362833).jpg](https://commons.wikimedia.org/wiki/File:German_Shepherd_-_DSC_0346_(10096362833).jpg) |
| Dachshund | CC BY-SA 4.0 | Katemil94 | [닥스훈트(단모종)_(Dachshund_(Short)).jpg](https://commons.wikimedia.org/wiki/File:닥스훈트(단모종)_(Dachshund_(Short)).jpg) |
| Poodle | see file | Unknown | [3840px-Full_attention_(8067543690).jpg](https://commons.wikimedia.org/wiki/File:3840px-Full_attention_(8067543690).jpg) |
| Beagle | CC BY-SA 3.0 | Unknown | [Beagle_600.jpg](https://commons.wikimedia.org/wiki/File:Beagle_600.jpg) |
| Rottweiler | CC BY-SA 3.0 | Dr. Manfred Herrmann Allgemeiner Deutscher Rottweiler-Klub ( | [Rottweiler_standing_facing_left.jpg](https://commons.wikimedia.org/wiki/File:Rottweiler_standing_facing_left.jpg) |
| German Shorthaired Pointer | CC BY-SA 3.0 | Bonnie van den Born, http://www.bonfoto.nl | [Duitse_staande_korthaar_10-10-2.jpg](https://commons.wikimedia.org/wiki/File:Duitse_staande_korthaar_10-10-2.jpg) |
| Bulldog | GFDL | Av3553 at English Wikipedia. | [Whitebulldog.jpg](https://commons.wikimedia.org/wiki/File:Whitebulldog.jpg) |
| Cane Corso | CC BY-SA 2.5 | Claudio Domiziani | [Cane_corso_temi_1_1024x768x24_(cropped).png](https://commons.wikimedia.org/wiki/File:Cane_corso_temi_1_1024x768x24_(cropped).png) |
| Cavalier King Charles Spaniel | CC BY-SA 3.0 | Andreweatock | [CarterBIS.Tiki.13.6.09.jpg](https://commons.wikimedia.org/wiki/File:CarterBIS.Tiki.13.6.09.jpg) |
| Yorkshire Terrier | CC BY-SA 4.0 | Svenska Mässan from Sweden | [(2_version)_Grupp_3,_YORKSHIRETERRIER,_NO_UCH_SE_UCH](https://commons.wikimedia.org/wiki/File:(2_version)_Grupp_3,_YORKSHIRETERRIER,_NO_UCH_SE_UCH_Oxzar_Amazing_Bel’s_Toffy_(24310212305).jpg) |
| Australian Shepherd | see file | Unknown | [3840px-Australian_Shepherd_red_bi.JPG](https://commons.wikimedia.org/wiki/File:3840px-Australian_Shepherd_red_bi.JPG) |
| Doberman Pinscher | Copyrighted free use | Miroslav Cacik | [Dobermann_handling.jpg](https://commons.wikimedia.org/wiki/File:Dobermann_handling.jpg) |
| Pembroke Welsh Corgi | CC BY-SA 4.0 | Dog breed facts | [Welsh_Pembroke_Corgi.jpg](https://commons.wikimedia.org/wiki/File:Welsh_Pembroke_Corgi.jpg) |
| Miniature Schnauzer | CC BY-SA 3.0 | Canarian | [Miniature_Schnauzer_salt_&_pepper_(cropped).jpg](https://commons.wikimedia.org/wiki/File:Miniature_Schnauzer_salt_&_pepper_(cropped).jpg) |
| Boxer | CC BY-SA 3.0 | Mood210 | [Male_fawn_Boxer_undocked.jpg](https://commons.wikimedia.org/wiki/File:Male_fawn_Boxer_undocked.jpg) |
| Pomeranian | Public domain | Blackoranges | [Pomeranian.JPG](https://commons.wikimedia.org/wiki/File:Pomeranian.JPG) |
| Bernese Mountain Dog | see file | Unknown | [3840px-3-BerneseMountainDogInGrass.jpg](https://commons.wikimedia.org/wiki/File:3840px-3-BerneseMountainDogInGrass.jpg) |
| Shih Tzu | Public domain | Canino21 | [Shihtzu_(cropped).jpg](https://commons.wikimedia.org/wiki/File:Shihtzu_(cropped).jpg) |
| Great Dane | CC BY-SA 2.5 | Lilly M | [Dog_niemiecki_żółty_LM980.jpg](https://commons.wikimedia.org/wiki/File:Dog_niemiecki_żółty_LM980.jpg) |
| Boston Terrier | CC BY 3.0 | Andreas Schlaugat | [Boston-terrier-carlos-de.JPG](https://commons.wikimedia.org/wiki/File:Boston-terrier-carlos-de.JPG) |
| Chihuahua | CC BY-SA 3.0 | Bonnie van den Born, http://www.bonfoto.nl. The original upl | [Chihuahua1_bvdb.jpg](https://commons.wikimedia.org/wiki/File:Chihuahua1_bvdb.jpg) |
| Havanese | CC BY-SA 2.0 | audrey_sel | [A_Havanese_judging.jpg](https://commons.wikimedia.org/wiki/File:A_Havanese_judging.jpg) |
| Border Collie | CC BY-SA 3.0 | Unknown | [Border_Collie_600.jpg](https://commons.wikimedia.org/wiki/File:Border_Collie_600.jpg) |
| English Springer Spaniel | CC0 | Ratsniffer | [Springer_Spaniel_Wide_Shot.jpg](https://commons.wikimedia.org/wiki/File:Springer_Spaniel_Wide_Shot.jpg) |
| Miniature American Shepherd | CC BY-SA 4.0 | Lextergrace | [Blue_Merle_Miniature_American_Shepherd_in_Grass.jpg](https://commons.wikimedia.org/wiki/File:Blue_Merle_Miniature_American_Shepherd_in_Grass.jpg) |
| Shetland Sheepdog | CC BY-SA 2.0 | Flickr user nickobec (Nick Cowie) | [Shetland_Sheepdog_sable.jpg](https://commons.wikimedia.org/wiki/File:Shetland_Sheepdog_sable.jpg) |
| Siberian Husky | CC BY-SA 3.0 | xJaM (talk · contribs) | [Husky_L.jpg](https://commons.wikimedia.org/wiki/File:Husky_L.jpg) |
