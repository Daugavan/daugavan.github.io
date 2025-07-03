document.addEventListener("DOMContentLoaded", function () {
    const galleryContainer = document.getElementById("gallery");
    const totalImages = 16; // Antal bilder

    // Bildinformation för bättre alt-texter
    const imageDetails = {
        1: "Ren 'MP' logotyp på mörk bakgrund",
        2: "Brusig 'MP' logotyp",
        3: "AI-bild: Polis griper en person framför en Volvo 240",
        4: "AI-bild: Polisbil (Volvo) i kaotisk stadsmiljö nattetid",
        5: "AI-bild: Poliser och bränder på gata i förort",
        6: "AI-bild: Modern polisbil (Volvo) bakifrån i orolig stadsmiljö",
        7: "AI-bild: Polisbil i stadsmiljö",
        8: "AI-bild: Polisbil med blåljus",
        9: "AI-bild: Polisbil i regn",
        10: "AI-bild: Polisbil i mörker",
        11: "AI-bild: Stor polisinsats i en krigsliknande stadsmiljö",
        12: "AI-bild: Polisbil med sirener",
        13: "AI-bild: Polisbil i solnedgång",
        14: "AI-bild: Polisbil i dimma",
        15: "AI-bild: Polisbil i snö",
        16: "AI-bild: Polisbil i stadstrafik"
    };

    for (let i = 1; i <= totalImages; i++) {
        let img = document.createElement("img");
        img.src = `images/img${i}.jpg`;
        
        // Förbättrad alt-text: Använder detaljerad text om den finns, annars en generell
        img.alt = imageDetails[i] || `Galleri bild ${i}`;
        
        // Lazy loading för snabbare sidladdning!
        img.loading = 'lazy';

        img.classList.add("gallery-item");
        img.addEventListener("click", () => openModal(img.src, img.alt));
        galleryContainer.appendChild(img);
    }

    // Modal-funktioner
    const modal = document.getElementById("imageModal");
    const modalImg = document.getElementById("modal-img");
    const closeModal = document.querySelector(".close");

    function openModal(imgSrc, imgAlt) {
        modal.style.display = "flex";
        modalImg.src = imgSrc;
        modalImg.alt = imgAlt; // Uppdatera även alt-texten i modalen
    }

    closeModal.addEventListener("click", () => {
        modal.style.display = "none";
    });

    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.style.display = "none";
        }
    });
});
