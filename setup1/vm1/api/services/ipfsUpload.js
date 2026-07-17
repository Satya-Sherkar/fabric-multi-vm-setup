import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import dotenv from "dotenv"

dotenv.config();

async function uploadToPinata(filePath) {
  try {
    const data = new FormData();
    data.append("file", fs.createReadStream(filePath));
    console.log("Uploading file to IPFS via Pinata...",process.env.PINATA_JWT);
    const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", data, {
      maxBodyLength: Infinity,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${data._boundary}`,
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
      },
    });

    console.log("File Uploaded Successfully!");
    console.log("CID:", res.data.IpfsHash);
    console.log("Gateway URL:", `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`);
    return {status:true, data:res.data};
  } catch (err) {
    console.error("Upload Error:", err.response?.data || err);
    return {status:false, data:err.response?.data || err};
  }
}

async function uploadJSONToPinata(data) {
    try {
        const response = await axios.post(
            "https://api.pinata.cloud/pinning/pinJSONToIPFS",
            data,
            {
                headers: {
                    Authorization: `Bearer ${process.env.PINATA_JWT}`,
                    "Content-Type": "application/json"
                }
            }
        );

        return {
            status: true,
            data: response.data
        };

    } catch (error) {
        return {
            status: false,
            data: error.response?.data || error.message
        };
    }
}

export { uploadToPinata, uploadJSONToPinata };