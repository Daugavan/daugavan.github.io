document.addEventListener("DOMContentLoaded", function () {
    // Step 1: Get DOM elements
    let nextDom = document.getElementById('next');
    let prevDom = document.getElementById('prev');

    let carouselDom = document.querySelector('.carousel');
    let SliderDom = carouselDom.querySelector('.carousel .list');
    let thumbnailBorderDom = carouselDom.querySelector('.carousel .thumbnail');
    let timeDom = carouselDom.querySelector('.carousel .time');

    const totalImages = 16; // Total number of images (img1.jpg to img16.jpg)

    // Image details for content and alt-texts (kept for potential future use, but not rendered)
    const imageDetails = {
        1: { title: "Mitt Galleri", topic: "Ren Logotyp", des: "Ren 'MP' logotyp på mörk bakgrund." },
        2: { title: "Mitt Galleri", topic: "Brusig Logotyp", des: "Brusig 'MP' logotyp med textur." },
        3: { title: "Mitt Galleri", topic: "AI-konst: Polisingripande", des: "AI-genererad bild av polisingripande framför en Volvo 240." },
        4: { title: "Mitt Galleri", topic: "AI-konst: Nattlig Stad", des: "AI-genererad bild av polisbil (Volvo) i kaotisk stadsmiljö nattetid." },
        5: { title: "Mitt Galleri", topic: "AI-konst: Förortskaos", des: "AI-genererad bild av poliser och bränder på gata i förort." },
        6: { title: "Mitt Galleri", topic: "AI-konst: Modern Polisbil", des: "AI-genererad bild av modern polisbil (Volvo) bakifrån i orolig stadsmiljö." },
        7: { title: "Mitt Galleri", topic: "AI-konst: Stadsmiljö", des: "AI-genererad bild: Polisbil i stadsmiljö." },
        8: { title: "Mitt Galleri", topic: "AI-konst: Blåljus", des: "AI-genererad bild: Polisbil med blåljus." },
        9: { title: "Mitt Galleri", topic: "AI-konst: Regnig Natt", des: "AI-genererad bild: Polisbil i regn." },
        10: { title: "Mitt Galleri", topic: "AI-konst: Mörker", des: "AI-genererad bild: Polisbil i mörker." },
        11: { title: "Mitt Galleri", topic: "AI-konst: Stor Insats", des: "AI-genererad bild: Stor polisinsats i en krigsliknande stadsmiljö." },
        12: { title: "Mitt Galleri", topic: "AI-konst: Sirener", des: "AI-genererad bild: Polisbil med sirener." },
        13: { title: "Mitt Galleri", topic: "AI-konst: Solnedgång", des: "AI-genererad bild: Polisbil i solnedgång." },
        14: { title: "Mitt Galleri", topic: "AI-konst: Dimma", des: "AI-genererad bild: Polisbil i dimma." },
        15: { title: "Mitt Galleri", topic: "AI-konst: Snö", des: "AI-genererad bild: Polisbil i snö." },
        16: { title: "Mitt Galleri", topic: "AI-konst: Stadstrafik", des: "AI-genererad bild: Polisbil i stadstrafik." }
    };

    // Dynamically create slider items and thumbnail items
    for (let i = 1; i <= totalImages; i++) {
        const itemData = imageDetails[i] || { title: `Bild ${i}`, topic: `Galleri`, des: `En bild från galleriet, nummer ${i}.` };

        // Create Slider Item (Main Image)
        let sliderItem = document.createElement('div');
        sliderItem.classList.add('item');
        sliderItem.innerHTML = `
            <img src="images/img${i}.jpg" alt="${itemData.des}">
            <div class="content">
                <div class="author">Marcus Pettersson</div>
                <div class="buttons">
                    <a href="mailto:daugavan@protonmail.com" class="button-link">KONTAKTA</a>
                </div>
            </div>
        `;
        SliderDom.appendChild(sliderItem);

        // Create Thumbnail Item
        let thumbnailItem = document.createElement('div');
        thumbnailItem.classList.add('item');
        thumbnailItem.innerHTML = `
            <img src="images/img${i}.jpg" alt="${itemData.des}">
        `;
        thumbnailBorderDom.appendChild(thumbnailItem);
    }

    // Move the first thumbnail to the end to match initial state of the example
    let initialThumbnailItems = thumbnailBorderDom.querySelectorAll('.item');
    if (initialThumbnailItems.length > 0) {
        thumbnailBorderDom.appendChild(initialThumbnailItems[0]);
    }

    let timeRunning = 3000; // Animation duration
    let timeAutoNext = 7000; // Auto-play interval

    nextDom.onclick = function(){
        showSlider('next');    
    }

    prevDom.onclick = function(){
        showSlider('prev');    
    }

    // Add click event listeners to thumbnails
    thumbnailBorderDom.querySelectorAll('.item').forEach((thumbnail, index) => {
        thumbnail.addEventListener('click', () => {
            // Clear any ongoing auto-play or animation timeouts
            clearTimeout(runTimeOut);
            clearTimeout(runNextAuto);

            // Get the image source of the clicked thumbnail
            const clickedThumbnailImgSrc = thumbnail.querySelector('img').src;

            // Find the corresponding main slider item
            let targetSliderItem = null;
            SliderDom.querySelectorAll('.item').forEach(item => {
                if (item.querySelector('img').src === clickedThumbnailImgSrc) {
                    targetSliderItem = item;
                }
            });

            // If the clicked thumbnail is already the first one, do nothing
            if (targetSliderItem === SliderDom.firstElementChild) {
                // Restart auto-play if it was stopped
                runNextAuto = setTimeout(() => {
                    nextDom.click();
                }, timeAutoNext);
                return;
            }

            // Remove current active classes
            carouselDom.classList.remove('next');
            carouselDom.classList.remove('prev');

            // Move the target item to the front of the main slider list
            SliderDom.prepend(targetSliderItem);

            // Move the corresponding thumbnail item to the front of the thumbnail list
            thumbnailBorderDom.prepend(thumbnail); // 'thumbnail' is already the clicked one

            // Trigger the animation for the new first item (optional, but makes it feel dynamic)
            // We can add a class to trigger a specific animation if needed,
            // but for now, just prepending will make it the active one.
            // The `showContent` animation will naturally apply to the new first child.

            // Restart auto-play
            runNextAuto = setTimeout(() => {
                nextDom.click();
            }, timeAutoNext);
        });
    });


    let runTimeOut;
    let runNextAuto = setTimeout(() => {
        nextDom.click();
    }, timeAutoNext);

    function showSlider(type){
        let SliderItemsDom = SliderDom.querySelectorAll('.carousel .list .item');
        let thumbnailItemsDom = thumbnailBorderDom.querySelectorAll('.carousel .thumbnail .item');

        if(type === 'next'){
            SliderDom.appendChild(SliderItemsDom[0]);
            thumbnailBorderDom.appendChild(thumbnailItemsDom[0]);
            carouselDom.classList.add('next');
        }else{
            SliderDom.prepend(SliderItemsDom[SliderItemsDom.length - 1]);
            thumbnailBorderDom.prepend(thumbnailItemsDom[thumbnailItemsDom.length - 1]);
            carouselDom.classList.add('prev');
        }
        clearTimeout(runTimeOut);
        runTimeOut = setTimeout(() => {
            carouselDom.classList.remove('next');
            carouselDom.classList.remove('prev');
        }, timeRunning);

        clearTimeout(runNextAuto);
        runNextAuto = setTimeout(() => {
            nextDom.click();
        }, timeAutoNext);
    }
});
