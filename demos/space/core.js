var DISPLAY_WIDTH = 1280, HALF_DISPLAY_WIDTH = DISPLAY_WIDTH / 2;
var DISPLAY_HEIGHT = 720, HALF_DISPLAY_HEIGHT = DISPLAY_HEIGHT / 2;
var ENEMY_BURST_DELAY = 5;

var game = new Game({target: "canvas"});
var player;
var playerTex, playerBulletTex, enemyTex1, enemyTex2, backgroundTex;
var lastBurst = ENEMY_BURST_DELAY / 2;
var enemies = [];

game.init();

var gameScene = new GameScene({
    name: "my game scene 1",
    game: game,
    backgroundColor: Color.fromRGB(29, 25, 35)
});

ContentLoader.load({
    images: [
        {path: "assets/player.png", alias: "player"},
        {path: "assets/player_bullet1.png", alias: "playerBullet"},
        {path: "assets/enemy_1.png", alias: "enemy1"},
        {path: "assets/enemy_2.png", alias: "enemy2"},
        {path: "assets/background.jpg", alias: "background"}
    ]
}).then(function (result) {
    game.changeScene(gameScene);
    game.setVirtualResolution(DISPLAY_WIDTH, DISPLAY_HEIGHT);
});

gameScene.initialize = function () {
    playerTex = new Texture2D(ContentLoader.getImage("player"));
    playerBulletTex = new Texture2D(ContentLoader.getImage("playerBullet"));
    enemyTex1 = new Texture2D(ContentLoader.getImage("enemy1"));
    enemyTex2 = new Texture2D(ContentLoader.getImage("enemy2"));
    backgroundTex = new Texture2D(ContentLoader.getImage("background"));

    var background = new Sprite({texture: backgroundTex});
    background.setWrapMode(WrapMode.REPEAT);
    sc.assignScript("backgroundAgent", background);

    player = new Sprite({texture: playerTex});
    player.transform.setPosition(-300, 0);
    player.transform.setScale(0.50);
    player.transform.setRotation(MathHelper.PI);
    sc.assignScript("playerInput", player);
    gameScene.addGameObject(player);
};

gameScene.lateUpdate = function (delta) {
    // show fps UI "tick"
    meter.tick();

    lastBurst += delta;
    if (lastBurst >= ENEMY_BURST_DELAY) {
        //this.dispatchEnemies();
        lastBurst = 0;
    }

    for (var i = 0; i < enemies.length; i++) {
        enemies[i].update(delta);
    }

    if (Keyboard.isKeyDown(Keys.Add)){
        this._camera.zoom -= 0.01;
    } else if (Keyboard.isKeyDown(Keys.Subtract)){
        this._camera.zoom += 0.01;
    }

};

gameScene.lateRender = function (delta) {
    for (var i = 0; i < enemies.length; i++) {
        this._spriteBatch.storeSprite(enemies[i]);
    }

};

gameScene.dispatchEnemies = function () {
    var i, count = 5;
    for (i = 1; i <= count; i++) {
        var enemy = new Sprite({texture: enemyTex2});
        enemy.transform.setPosition(HALF_DISPLAY_WIDTH + i * 200, Math.random() * (DISPLAY_HEIGHT - 100) - (HALF_DISPLAY_HEIGHT - 100));
        enemy.transform.setScale(0.60);
        enemy.transform.lookAt(player.transform.getPosition());
        //enemy.transform.setRotation(-MathHelper.PIo2);
        sc.assignScript("enemyAgent", enemy);

        enemies.push(enemy);
    }

};