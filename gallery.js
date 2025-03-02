document.addEventListener("DOMContentLoaded", function () {
    const galleryContainer = document.getElementById("gallery");
    const totalImages = 18; // Number of images

    for (let i = 1; i <= totalImages; i++) {
        let img = document.createElement("img");
        img.src = `images/img${i}.jpg`;
        img.alt = `Image ${i}`;
        img.classList.add("gallery-item");
        img.addEventListener("click", () => openModal(img.src));
        galleryContainer.appendChild(img);
    }

    // Modal functions
    const modal = document.getElementById("imageModal");
    const modalImg = document.getElementById("modal-img");
    const closeModal = document.querySelector(".close");

    function openModal(imgSrc) {
        modal.style.display = "flex";
        modalImg.src = imgSrc;
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