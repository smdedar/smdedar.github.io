document.addEventListener("DOMContentLoaded", function () {
  fetch("paper.md")
    .then((response) => response.text())
    .then((markdown) => {
      // Convert Markdown to HTML using a basic Markdown parser (marked.js)
      const htmlContent = marked.parse(markdown);

      // Display the rendered content inside the #content div
      document.getElementById("content").innerHTML = htmlContent;
    })
    .catch((error) => {
      document.getElementById("content").innerHTML = "Error loading paper.md.";
      console.error("Error fetching Markdown file:", error);
    });
});
