document.addEventListener("DOMContentLoaded", function () {
  const images = document.querySelectorAll(".gallery-item");

  images.forEach(img => {
    img.addEventListener("click", function () {
      const modal = document.createElement("div");
      modal.classList.add("modal");
      modal.innerHTML = `
        <div class="modal-content">
          <span class="close">&times;</span>
          <img src="${img.src}" alt="Enlarged Image">
        </div>
      `;
      document.body.appendChild(modal);

      // Close Modal
      modal.querySelector(".close").addEventListener("click", () => {
        modal.remove();
      });

      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.remove();
      });
    });
  });
});
