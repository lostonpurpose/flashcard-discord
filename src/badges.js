export function badges(streak){
    let badge = "";
    if (streak >= 50) {
    badge = "🎖"
    }
    else if (streak >= 40 && streak <= 49) {
    badge = "🏅"
    }
    else if (streak >= 30 && streak <= 39) {
    badge = "🥇"
    }
    else if (streak >= 20 && streak <= 29) {
    badge = "🥈"
    }
    else if (streak >= 10 && streak <= 19) {
    badge = "🥉"
    }
    else {
    badge = ""
    }
    return badge;
};