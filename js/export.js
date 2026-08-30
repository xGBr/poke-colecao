function exportarParaJSON() {
    // 1. Buscar os dados do localStorage (substitua 'minhaColecao' pelo nome da sua chave real)
    const dadosLocalStorage = localStorage.getItem('minhaColecao');
    
    if (!dadosLocalStorage) {
        alert("Nenhuma coleção encontrada no localStorage!");
        return;
    }

    let colecaoOriginal = [];
    try {
        colecaoOriginal = JSON.parse(dadosLocalStorage);
    } catch (e) {
        console.error("Erro ao ler o localStorage:", e);
        return;
    }

    // 2. Formatar os dados para o seu modelo específico
    const colecaoFormatada = colecaoOriginal.map(carta => {
        return {
            name: carta.name || "Nome Desconhecido",
            num: carta.num || carta.number || "0/0", // Depende de como a API original salvou
            category: carta.category || "Principal", 
            // Pega o ano da data de lançamento do set, se existir
            year: carta.year || (carta.set && carta.set.releaseDate ? parseInt(carta.set.releaseDate.substring(0, 4)) : 0),
            set: carta.set && typeof carta.set === 'object' ? carta.set.name : (carta.set || "Set Desconhecido"),
            
            // Monta o link da Liga Pokemon (exemplo básico, pode precisar de ajustes dependendo do nome da edição)
            liga: carta.liga || `https://www.ligapokemon.com.br/?view=cards/card&card=${encodeURIComponent(carta.name)}`,
            
            preco: carta.preco || "R$ 0,00",
            img: carta.img || (carta.images ? carta.images.small : ""),
            espera: carta.espera || false,
            
            // Pega a raridade da API ou usa "Normal" como padrão
            rarities: carta.rarities || (carta.rarity ? [carta.rarity] : ["Normal"]),
            
            // Garante que o ID seja numérico (timestamp) ou o ID original
            id: carta.id && !isNaN(carta.id) ? Number(carta.id) : Date.now() + Math.floor(Math.random() * 1000)
        };
    });

    // 3. Converter o objeto formatado em uma string JSON
    const jsonString = JSON.stringify(colecaoFormatada, null, 2); // '2' adiciona indentação bonita

    // 4. Criar um "Blob" (arquivo temporário na memória do navegador)
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    // 5. Criar um link invisível e clicar nele para forçar o download
    const linkDownload = document.createElement('a');
    linkDownload.href = url;
    linkDownload.download = "minha_colecao_pokemon.json"; // Nome do arquivo
    
    document.body.appendChild(linkDownload);
    linkDownload.click();
    
    // 6. Limpar o elemento após o download
    document.body.removeChild(linkDownload);
    URL.revokeObjectURL(url);
}

// Exemplo de como usar: 
// Você pode atrelar isso a um botão no seu HTML, por exemplo:
// document.getElementById('btnExportar').addEventListener('click', exportarParaJSON);
