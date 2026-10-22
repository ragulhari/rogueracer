# RogueRacer

Jogo de corrida com visão aérea feito com Three.js + Vite.

## Jogar

Dê dois cliques em **jogar.html**: ele abre direto no navegador, sem instalar nada.
(O `index.html` é o código-fonte e só funciona com `npm run dev`.)

O jogo precisa de WebGL. Se aparecer o aviso de WebGL, ative a aceleração de hardware do navegador.

## Rodar o código-fonte

```bash
npm install
npm run dev      # abre em http://localhost:5173
npm run build    # gera dist/
npm run build:jogar   # gera jogar.html e dist-artifact/ (HTML único)
node tools/sim.mjs normal 0.9   # simula corridas sem navegador (dificuldade, ritmo do robô)
node tools/plot-track.mjs pista.svg   # desenha o traçado de Monaque (ou passe um nível)
```

Abra com `?autopilot` na URL para a IA dirigir o seu carro.

## Deploy na Netlify

O `netlify.toml` já diz tudo para a Netlify: comando `npm run build`, pasta publicada `dist`, Node 20.

1. Em app.netlify.com, clique em **Add new site → Import an existing project**.
2. Escolha **GitHub** e selecione este repositório.
3. Confira que aparecem *Build command* `npm run build` e *Publish directory* `dist` (vêm do `netlify.toml`) e clique em **Deploy**.

A cada push na branch principal a Netlify publica de novo sozinha.

## Como funciona

- Cada nível é uma pista procedural (mesma semente = mesma pista). 3 voltas contra 3 adversários.
- Antes de cada tentativa você escolhe 1 entre 3 bônus (peso, pneus, motor, aerodinâmica, freios, direção, nitro, vácuo, carroceria, suspensão). O bônus vale só para aquela tentativa.
- Só o 1º lugar avança. Perdendo, você volta para a mesma pista com outras opções de bônus.
- A partir da pista 2 aparecem manchas de óleo; todas as pistas têm placas de turbo.
- A cada derrota na mesma pista os adversários ficam 1% mais lentos (até 4%), e a partir da 3ª tentativa pelo menos um bônus raro aparece.
- Menu inicial: **Carreira** (todas as pistas em sequência, o modo roguelike) e **Corrida livre** (escolha qualquer pista; ganha XP, não muda a carreira).
- Pistas fixas desenhadas à mão: Monaque (pista 5 da carreira) e Interlakes (pista 8), as duas com 2 voltas.
- Carros no formato de Fórmula 1; som do motor sintetizado com rotação, marchas, turbo e estalos do escapamento.
- Dificuldades: Fácil, Normal, Difícil e Insano (menu, ↑/↓). Difícil e Insano dão mais XP.
- Cor do carro no menu (←/→) e volume do som (V).
- A experiência do piloto é permanente (salva no navegador): cada nível dá mais aderência, direção, potência, freio e velocidade máxima.
- Sem freio de mão (carro de Fórmula). Andar logo atrás e alinhado com outro carro dá vácuo: menos arrasto e um pouco mais de velocidade. Bônus de vácuo: Asa de baixo arrasto (2× mais forte), Sensor de esteira (alcance +70%) e Recuperação no vácuo (o vácuo recarrega o nitro).
- Grid de 20 carros (`src/grid.js`). Você larga em 8º no Normal (6º no Fácil, 10º no Difícil, 12º no Insano) e sobe duas posições a cada nova tentativa. A IA desvia, ultrapassa pelo lado com mais espaço e espera atrás quando não cabe.
- Pinturas com cor principal, cor secundária e 6 desenhos (`src/livery.js`), escolhidos no menu inicial com prévia. Os adversários recebem combinações sorteadas sem repetir.

## Estrutura

- `src/track.js` geração das pistas
- `src/physics.js` física arcade do carro (aderência, derrapagem, desgaste, nitro, vácuo, muretas, voltas)
- `src/ai.js` adversários e dificuldade por nível
- `src/upgrades.js` lista de bônus
- `src/driver.js` XP do piloto, atributos e save
- `src/scene.js` visual (pista, carros, marcas de pneu)
- `src/main.js` loop do jogo, telas e HUD
- `src/audio.js` som do motor (WebAudio)
