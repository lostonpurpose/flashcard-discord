export function badges(correctCount){
    let badge = "";
    if (correctCount >= 50) {
    badge = "🎖"
    }
    else if (correctCount >= 40 && correctCount <= 49) {
    badge = "🏅"
    }
    else if (correctCount >= 30 && correctCount <= 39) {
    badge = "🥇"
    }
    else if (correctCount >= 20 && correctCount <= 29) {
    badge = "🥈"
    }
    else if (correctCount >= 10 && correctCount <= 19) {
    badge = "🥉"
    }
    else {
    badge = ""
    }
    return badge;
};