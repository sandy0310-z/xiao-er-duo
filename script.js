
function goToLevel(page) {
    var clickSound = new Audio('audio/click.mp3');
    clickSound.play();
    setTimeout(() => {
        window.location.href = page;
    }, 500);
}
