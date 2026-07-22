exports.handler = async (event, context) => {
    try {
        const response = await fetch('https://firestore.googleapis.com/v1/projects/grupos-whats-app/databases/(default)/documents/grupos');
        if (!response.ok) {
            throw new Error(`Erro na API do Firestore: ${response.statusText}`);
        }
        
        const data = await response.json();
        const docs = data.documents || [];
        
        // Formatar para os Scrapers
        const feed = docs.map(doc => {
            const fields = doc.fields;
            const id = doc.name.split('/').pop();
            return {
                id: id,
                title: fields.nome?.stringValue || 'Grupo de WhatsApp',
                category: fields.categoria?.stringValue || 'Geral',
                description: fields.descricao?.stringValue || '',
                image: fields.imagem?.stringValue || '',
                visits: parseInt(fields.visitas?.integerValue || '0'),
                source_url: `https://mg5860606-ux.github.io/GRUPOWHATSS/group-details.html?id=${id}`
            };
        });

        // Ordenar por visitas (popularidade)
        feed.sort((a, b) => b.visits - a.visits);

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=3600"
            },
            body: JSON.stringify({
                site: "GruposWhats",
                url: "https://mg5860606-ux.github.io/GRUPOWHATSS",
                description: "O maior agregador de links de grupos de WhatsApp do Brasil.",
                last_updated: new Date().toISOString(),
                groups: feed.slice(0, 50) // Limita aos top 50 para evitar sobrecarga
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
