function openModal() {
    document.getElementById("confirmModal").style.display = "flex";
}

function closeModal() {
    document.getElementById("confirmModal").style.display = "none";
}

function confirmTransaction() {

    closeModal();

    document.getElementById("successMessage").style.display = "block";

    setTimeout(function() {

        document.getElementById("successMessage").style.display = "none";

    }, 3000);

}


// Initial Inventory Data

if (!localStorage.getItem("inventory")) {

    const inventory = [

        {
            item: "A4 SHEET",
            stock: 0,
            status: "Low"
        },

        {
            item: "ARCHIVE BOXES",
            stock: 13,
            status: "Medium"
        },

        {
            item: "CEDI DEPOSIT",
            stock: 463,
            status: "Available"
        },

        {
            item: "NOTE PADS",
            stock: 5,
            status: "Low"
        }

    ];

    localStorage.setItem(
        "inventory",
        JSON.stringify(inventory)
    );
}


// Local storage
const inventoryData =
JSON.parse(localStorage.getItem("inventory"));

const table =
document.getElementById("inventoryTable");

if(table){

    inventoryData.forEach(item => {

        table.innerHTML += `
        <tr>

            <td>${item.item}</td>

            <td>${item.stock}</td>

            <td>
                <span class="status">
                    ${item.status}
                </span>
            </td>

        </tr>
        `;

    });

}


//save function 

function saveTransaction(){

    const item =
    document.getElementById("itemName").value;

    const received =
    parseInt(
        document.getElementById("received").value
    ) || 0;

    const supplied =
    parseInt(
        document.getElementById("supplied").value
    ) || 0;

    let inventory =
    JSON.parse(localStorage.getItem("inventory"));

    inventory.forEach(record => {

        if(record.item === item){

            record.stock =
            record.stock + received - supplied;

        }

    });

    localStorage.setItem(
        "inventory",
        JSON.stringify(inventory)
    );

    alert("Transaction Saved");

}


//View Modal 

function openViewModal(){

    document.getElementById("viewModal")
        .style.display = "flex";

}

function closeViewModal(){

    document.getElementById("viewModal")
        .style.display = "none";

}
